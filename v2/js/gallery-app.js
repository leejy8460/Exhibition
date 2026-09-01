/** 공통 전시 갤러리 앱 */
(function () {
  const {
    IMAGE_COUNT,
    getSource,
    listSources,
  } = window.ExhibitionSources;

  const USE_AI = Boolean(window.EXHIBITION_USE_AI);
  const PHOTO_MAX_WIDTH = 480;
  const PHOTO_MIN_WIDTH = 160;
  const PHOTO_SIZE_KEY = "atelier-nord-photo-size";
  const WORKS_CACHE_PREFIX = "atelier-nord-works-v1";
  const IMAGE_CACHE_NAME = "atelier-nord-images-v1";
  const DEFAULT_SOURCE = "met";
  const ROW_HEIGHTS = [640, 480, 720, 560, 600];

  const grid = document.getElementById("gallery-grid");
  const renewBtn = document.getElementById("renew-btn");
  const sizeSlider = document.getElementById("size-slider");
  const sourceSelect = document.getElementById("source-select");
  const heroImage = document.querySelector(".hero__image");
  const galleryBlurb = document.getElementById("gallery-blurb");
  const creditNote = document.getElementById("credit-note");
  const versionSwitch = document.getElementById("version-switch");
  const lightbox = document.getElementById("lightbox");
  const lightboxImage = document.getElementById("lightbox-image");
  const lightboxCaption = document.getElementById("lightbox-caption");

  let itemObserver = null;
  let currentColumnCount = null;
  let relayoutTimer = null;
  let captionRequestId = 0;
  let currentWorks = [];
  let loading = false;
  let activeBlobUrls = [];

  function getPhotoSize() {
    return Number(sizeSlider.value);
  }

  function applyPhotoSize() {
    const size = Math.min(getPhotoSize(), PHOTO_MAX_WIDTH);
    const sizePx = `${size}px`;
    grid.style.setProperty("--photo-size", sizePx);
    document.documentElement.style.setProperty("--photo-size", sizePx);
  }

  function loadSavedPhotoSize() {
    const saved = Number(localStorage.getItem(PHOTO_SIZE_KEY));
    if (
      Number.isFinite(saved) &&
      saved >= PHOTO_MIN_WIDTH &&
      saved <= PHOTO_MAX_WIDTH
    ) {
      sizeSlider.value = String(saved);
    }
  }

  function savePhotoSize() {
    localStorage.setItem(PHOTO_SIZE_KEY, String(getPhotoSize()));
  }

  function worksCacheKey(sourceId) {
    return `${WORKS_CACHE_PREFIX}:${sourceId}${USE_AI ? ":ai" : ""}`;
  }

  function loadWorksCache(sourceId) {
    try {
      const raw = localStorage.getItem(worksCacheKey(sourceId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed?.works) || parsed.works.length === 0) return null;
      return parsed.works;
    } catch {
      return null;
    }
  }

  function saveWorksCache(sourceId, works) {
    try {
      localStorage.setItem(
        worksCacheKey(sourceId),
        JSON.stringify({ savedAt: Date.now(), works })
      );
    } catch (error) {
      console.warn("works cache save failed", error);
    }
  }

  async function getImageCache() {
    if (!("caches" in window)) return null;
    try {
      return await caches.open(IMAGE_CACHE_NAME);
    } catch {
      return null;
    }
  }

  function revokeBlobUrls() {
    activeBlobUrls.forEach((url) => URL.revokeObjectURL(url));
    activeBlobUrls = [];
  }

  async function resolveImageSrc(url) {
    if (!url) return url;
    const cache = await getImageCache();
    if (!cache) return url;

    try {
      const match = await cache.match(url);
      if (match) {
        const blob = await match.blob();
        const objectUrl = URL.createObjectURL(blob);
        activeBlobUrls.push(objectUrl);
        return objectUrl;
      }
    } catch {
      /* fall through */
    }

    return url;
  }

  async function cacheImageUrl(url) {
    if (!url) return;
    const cache = await getImageCache();
    if (!cache) return;

    try {
      const existing = await cache.match(url);
      if (existing) return;
      const response = await fetch(url, { mode: "cors", credentials: "omit" });
      if (response.ok) {
        await cache.put(url, response.clone());
      }
    } catch {
      /* ignore network/CORS failures */
    }
  }

  function warmImageCache(works) {
    works.forEach((work) => {
      cacheImageUrl(work.imageUrl);
      if (work.largeUrl && work.largeUrl !== work.imageUrl) {
        cacheImageUrl(work.largeUrl);
      }
      if (work.thumbUrl && work.thumbUrl !== work.imageUrl) {
        cacheImageUrl(work.thumbUrl);
      }
    });
  }

  function getColumnCount() {
    const styles = getComputedStyle(grid);
    const gap =
      parseFloat(styles.columnGap) ||
      parseFloat(styles.gap) ||
      20;
    const width = grid.clientWidth;
    const photoSize = Math.min(getPhotoSize(), width || getPhotoSize());
    return Math.max(1, Math.floor((width + gap) / (photoSize + gap)));
  }

  function disconnectObserver() {
    if (itemObserver) {
      itemObserver.disconnect();
      itemObserver = null;
    }
  }

  function currentSource() {
    return getSource(sourceSelect.value);
  }

  function populateSourceSelect() {
    sourceSelect.replaceChildren();
    listSources().forEach((source) => {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = source.label;
      sourceSelect.append(option);
    });
    sourceSelect.value = DEFAULT_SOURCE;
  }

  function updateSourceCopy(source) {
    if (galleryBlurb) galleryBlurb.textContent = source.blurb;
    if (creditNote) {
      creditNote.textContent = `Images courtesy of ${source.credit}`;
    }
    if (versionSwitch) {
      versionSwitch.hidden = source.id !== "picsum";
    }
  }

  function formatCaption(label, work, fallbackTitle) {
    const title = work.title || fallbackTitle || "";
    if (title) return `${label} · ${title}`;
    return label;
  }

  function getCaptionApiUrl() {
    const base = (window.CAPTION_API_BASE || "").replace(/\/$/, "");
    return `${base}/api/captions`;
  }

  async function fetchCaptions(images) {
    const response = await fetch(getCaptionApiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ images }),
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(detail.error || "제목 생성에 실패했습니다.");
    }
    return response.json();
  }

  async function fetchCaptionsInBatches(images, batchSize = 6) {
    const captions = [];
    for (let i = 0; i < images.length; i += batchSize) {
      const chunk = images.slice(i, i + batchSize);
      const result = await fetchCaptions(chunk);
      captions.push(...(result.captions || []));
    }
    return captions;
  }

  function observeItems() {
    const items = grid.querySelectorAll(".gallery__item");
    if (!("IntersectionObserver" in window)) {
      items.forEach((item) => item.classList.add("is-visible"));
      return;
    }

    itemObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            itemObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );

    items.forEach((item, index) => {
      item.style.transitionDelay = `${(index % 6) * 60}ms`;
      itemObserver.observe(item);
    });
  }

  async function renderWorks(works, { pendingAi = false } = {}) {
    const columnCount = getColumnCount();
    currentColumnCount = columnCount;
    disconnectObserver();
    revokeBlobUrls();
    grid.replaceChildren();

    const fragment = document.createDocumentFragment();
    const imageNodes = [];

    works.forEach((work, index) => {
      const row = Math.floor(index / columnCount);
      const height = ROW_HEIGHTS[row % ROW_HEIGHTS.length];
      const number = index + 1;
      const label = `No. ${String(number).padStart(2, "0")}`;
      const titleForDisplay = pendingAi && !work.title ? "…" : work.title;
      const caption = formatCaption(label, work, titleForDisplay);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery__item";
      button.dataset.imageId = work.id;
      button.dataset.label = label;
      button.dataset.caption = caption;
      button.setAttribute("aria-label", `${caption} 크게 보기`);

      const img = document.createElement("img");
      img.alt = caption;
      img.loading = "lazy";
      img.width = work.width || PHOTO_MAX_WIDTH;
      img.height = work.height || height;

      const meta = document.createElement("p");
      meta.className = "gallery__meta";

      const titleSpan = document.createElement("span");
      titleSpan.className = "gallery__title";
      titleSpan.textContent = caption;

      meta.append(titleSpan);

      if (work.artist) {
        const artistSpan = document.createElement("span");
        artistSpan.className = "gallery__artist";
        artistSpan.textContent = work.artist;
        meta.append(artistSpan);
      }

      button.append(img, meta);
      button.addEventListener("click", () => {
        openLightbox(
          work.largeUrl || work.imageUrl,
          button.dataset.caption || caption,
          work.artist || ""
        );
      });

      fragment.append(button);
      imageNodes.push({ img, url: work.imageUrl });
    });

    grid.append(fragment);
    observeItems();

    await Promise.all(
      imageNodes.map(async ({ img, url }) => {
        img.src = await resolveImageSrc(url);
      })
    );
  }

  function applyAiTitles(captions) {
    const byId = new Map(
      captions.filter((item) => item?.id && item?.title).map((item) => [item.id, item.title])
    );

    currentWorks = currentWorks.map((work) => {
      const title = byId.get(work.id);
      return title ? { ...work, title } : work;
    });

    saveWorksCache(currentSource().id, currentWorks);
    return renderWorks(currentWorks);
  }

  async function maybeGenerateAiTitles(source, works) {
    if (!USE_AI || source.hasMetadata) return;

    const missing = works
      .filter((work) => !work.title)
      .map((work) => ({
        id: work.id,
        url: work.thumbUrl || work.imageUrl,
      }));

    if (missing.length === 0) return;

    const requestId = ++captionRequestId;
    try {
      const captions = await fetchCaptionsInBatches(missing);
      if (requestId !== captionRequestId) return;
      await applyAiTitles(captions);
    } catch (error) {
      console.error(error);
      if (requestId !== captionRequestId) return;
      await renderWorks(currentWorks);
    }
  }

  async function fetchFreshWorks(source) {
    let works = await source.fetchWorks(IMAGE_COUNT);
    if (works.length < IMAGE_COUNT && source.id !== "picsum") {
      const more = await source.fetchWorks(IMAGE_COUNT);
      const seen = new Set(works.map((work) => work.id));
      more.forEach((work) => {
        if (!seen.has(work.id) && works.length < IMAGE_COUNT) {
          seen.add(work.id);
          works.push(work);
        }
      });
    }
    return works.slice(0, IMAGE_COUNT);
  }

  async function loadExhibition({
    renewHero = true,
    forceRefresh = false,
  } = {}) {
    if (loading) return;
    loading = true;

    const source = currentSource();
    updateSourceCopy(source);
    applyPhotoSize();

    renewBtn.disabled = true;
    sourceSelect.disabled = true;
    renewBtn.textContent = forceRefresh ? "불러오는 중…" : "불러오는 중…";
    grid.classList.add("is-renewing");

    if (lightbox.open) lightbox.close();

    try {
      let works = forceRefresh ? null : loadWorksCache(source.id);
      let fromCache = Boolean(works);

      if (!works) {
        works = await fetchFreshWorks(source);
        fromCache = false;
        saveWorksCache(source.id, works);
      }

      currentWorks = works;

      if (heroImage && currentWorks[0]) {
        const heroUrl = currentWorks[0].largeUrl || currentWorks[0].imageUrl;
        heroImage.src = await resolveImageSrc(heroUrl);
        cacheImageUrl(heroUrl);
      } else if (renewHero && heroImage && !fromCache) {
        heroImage.src = source.heroUrl();
      }

      const pendingAi =
        USE_AI && !source.hasMetadata && currentWorks.some((work) => !work.title);
      await renderWorks(currentWorks, { pendingAi });
      await maybeGenerateAiTitles(source, currentWorks);
      warmImageCache(currentWorks);
    } catch (error) {
      console.error(error);
      const cached = loadWorksCache(source.id);
      if (cached?.length) {
        currentWorks = cached;
        await renderWorks(currentWorks);
        if (heroImage && currentWorks[0]) {
          heroImage.src = await resolveImageSrc(
            currentWorks[0].largeUrl || currentWorks[0].imageUrl
          );
        }
      } else {
        grid.innerHTML =
          '<p class="gallery__error">전시를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
      }
    } finally {
      grid.classList.remove("is-renewing");
      renewBtn.disabled = false;
      sourceSelect.disabled = false;
      renewBtn.textContent = "전시 갱신";
      loading = false;
    }
  }

  function scheduleRelayout() {
    window.clearTimeout(relayoutTimer);
    relayoutTimer = window.setTimeout(() => {
      if (getColumnCount() !== currentColumnCount && currentWorks.length) {
        const source = currentSource();
        const pendingAi =
          USE_AI &&
          !source.hasMetadata &&
          currentWorks.some((work) => !work.title);
        renderWorks(currentWorks, { pendingAi });
      }
    }, 120);
  }

  async function openLightbox(src, caption, artist) {
    lightboxImage.src = await resolveImageSrc(src);
    lightboxImage.alt = caption;
    if (lightboxCaption) {
      lightboxCaption.textContent = artist ? `${caption} — ${artist}` : caption;
    }
    lightbox.showModal();
    cacheImageUrl(src);
  }

  sizeSlider.max = String(PHOTO_MAX_WIDTH);
  sizeSlider.min = String(PHOTO_MIN_WIDTH);
  loadSavedPhotoSize();
  populateSourceSelect();
  updateSourceCopy(currentSource());

  sizeSlider.addEventListener("input", () => {
    applyPhotoSize();
    savePhotoSize();
    scheduleRelayout();
  });

  sourceSelect.addEventListener("change", () => {
    loadExhibition({ renewHero: true, forceRefresh: false });
  });

  renewBtn.addEventListener("click", () => {
    loadExhibition({ renewHero: true, forceRefresh: true });
    document.getElementById("gallery").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });

  window.addEventListener("resize", scheduleRelayout);

  lightbox.querySelector(".lightbox__close").addEventListener("click", () => {
    lightbox.close();
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.close();
  });

  loadExhibition({ renewHero: false, forceRefresh: false });
})();
