/** 공통 전시 갤러리 앱 */
(function () {
  const {
    IMAGE_COUNT,
    getSource,
    listSources,
  } = window.ExhibitionSources;
  const LocalFolders = window.ExhibitionLocalFolders;

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
  const addFolderBtn = document.getElementById("add-folder-btn");
  const removeFolderBtn = document.getElementById("remove-folder-btn");
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
  let localFolderRecords = [];

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
    if (LocalFolders.isLocalSourceId(sourceId)) return null;
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
    if (LocalFolders.isLocalSourceId(sourceId)) return;
    try {
      localStorage.setItem(
        worksCacheKey(sourceId),
        JSON.stringify({ savedAt: Date.now(), works })
      );
    } catch (error) {
      console.warn("works cache save failed", error);
    }
  }

  function clearWorksCache(sourceId) {
    localStorage.removeItem(worksCacheKey(sourceId));
  }

  async function getImageCache() {
    if (!("caches" in window)) return null;
    try {
      return await caches.open(IMAGE_CACHE_NAME);
    } catch {
      return null;
    }
  }

  function revokeBlobUrls(keepUrls = []) {
    const keep = new Set(keepUrls.filter(Boolean));
    activeBlobUrls.forEach((url) => {
      if (!keep.has(url)) URL.revokeObjectURL(url);
    });
    activeBlobUrls = [...keep];
  }

  function localBlobUrlsFromWorks(works) {
    const urls = [];
    works.forEach((work) => {
      if (!work?.isLocalBlob) return;
      [work.imageUrl, work.thumbUrl, work.largeUrl].forEach((url) => {
        if (isBlobUrl(url) && !urls.includes(url)) urls.push(url);
      });
    });
    return urls;
  }

  function isBlobUrl(url) {
    return typeof url === "string" && url.startsWith("blob:");
  }

  async function resolveImageSrc(url) {
    if (!url || isBlobUrl(url)) return url;
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
    if (!url || isBlobUrl(url)) return;
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
      /* ignore */
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

  function resolveSource(id) {
    if (LocalFolders.isLocalSourceId(id)) {
      const record = localFolderRecords.find((item) => item.id === id);
      if (record) return LocalFolders.createLocalSource(record);
    }
    return getSource(id);
  }

  function currentSource() {
    return resolveSource(sourceSelect.value);
  }

  async function refreshLocalFolders() {
    try {
      localFolderRecords = await LocalFolders.listFolders();
    } catch (error) {
      console.warn(error);
      localFolderRecords = [];
    }
  }

  async function populateSourceSelect(preferredId) {
    const selected = preferredId || sourceSelect.value || DEFAULT_SOURCE;
    await refreshLocalFolders();
    sourceSelect.replaceChildren();

    listSources().forEach((source) => {
      const option = document.createElement("option");
      option.value = source.id;
      option.textContent = source.label;
      sourceSelect.append(option);
    });

    localFolderRecords
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "ko"))
      .forEach((record) => {
        const option = document.createElement("option");
        option.value = record.id;
        option.textContent = `로컬 — ${record.name}`;
        sourceSelect.append(option);
      });

    const exists = [...sourceSelect.options].some(
      (option) => option.value === selected
    );
    sourceSelect.value = exists ? selected : DEFAULT_SOURCE;
    updateFolderButtons();
  }

  function updateFolderButtons() {
    const isLocal = LocalFolders.isLocalSourceId(sourceSelect.value);
    if (removeFolderBtn) {
      removeFolderBtn.hidden = !isLocal;
      removeFolderBtn.disabled = !isLocal;
    }
    if (addFolderBtn) {
      addFolderBtn.disabled = !LocalFolders.supportsDirectoryPicker();
      addFolderBtn.title = LocalFolders.supportsDirectoryPicker()
        ? "이 컴퓨터의 이미지 폴더를 전시로 추가"
        : "Chrome 또는 Edge에서만 로컬 폴더를 추가할 수 있습니다";
    }
  }

  function updateSourceCopy(source) {
    if (galleryBlurb) galleryBlurb.textContent = source.blurb;
    if (creditNote) {
      creditNote.textContent = source.isLocal
        ? source.credit
        : `Images courtesy of ${source.credit}`;
    }
    if (versionSwitch) {
      versionSwitch.hidden = source.id !== "picsum";
    }
    updateFolderButtons();
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
    revokeBlobUrls(localBlobUrlsFromWorks(works));
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

      if (
        isBlobUrl(work.imageUrl) &&
        !activeBlobUrls.includes(work.imageUrl)
      ) {
        activeBlobUrls.push(work.imageUrl);
      }

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
    if (!USE_AI || source.hasMetadata || source.isLocal) return;

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
    if (
      works.length < IMAGE_COUNT &&
      source.id !== "picsum" &&
      !source.isLocal
    ) {
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

  async function loadExhibition({ forceRefresh = false } = {}) {
    if (loading) return;
    loading = true;

    const source = currentSource();
    updateSourceCopy(source);
    applyPhotoSize();

    renewBtn.disabled = true;
    sourceSelect.disabled = true;
    if (addFolderBtn) addFolderBtn.disabled = true;
    if (removeFolderBtn) removeFolderBtn.disabled = true;
    renewBtn.textContent = "불러오는 중…";
    grid.classList.add("is-renewing");

    if (lightbox.open) lightbox.close();

    try {
      const skipCache = forceRefresh || source.isLocal;
      let works = skipCache ? null : loadWorksCache(source.id);

      if (!works) {
        works = await fetchFreshWorks(source);
        if (!source.isLocal) {
          saveWorksCache(source.id, works);
        }
      }

      currentWorks = works;

      const pendingAi =
        USE_AI &&
        !source.hasMetadata &&
        !source.isLocal &&
        currentWorks.some((work) => !work.title);
      await renderWorks(currentWorks, { pendingAi });
      await maybeGenerateAiTitles(source, currentWorks);
      warmImageCache(currentWorks);
    } catch (error) {
      console.error(error);
      const cached = loadWorksCache(source.id);
      if (cached?.length) {
        currentWorks = cached;
        await renderWorks(currentWorks);
      } else {
        grid.innerHTML = `<p class="gallery__error">${
          error?.message ||
          "전시를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
        }</p>`;
      }
    } finally {
      grid.classList.remove("is-renewing");
      renewBtn.disabled = false;
      sourceSelect.disabled = false;
      renewBtn.textContent = "전시 갱신";
      loading = false;
      updateFolderButtons();
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
          !source.isLocal &&
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

  async function handleAddFolder() {
    try {
      const record = await LocalFolders.pickAndAddFolder();
      await populateSourceSelect(record.id);
      updateSourceCopy(currentSource());
      await loadExhibition({ forceRefresh: true });
    } catch (error) {
      if (error?.name === "AbortError") return;
      window.alert(error?.message || "폴더를 추가하지 못했습니다.");
    }
  }

  async function handleRemoveFolder() {
    const id = sourceSelect.value;
    if (!LocalFolders.isLocalSourceId(id)) return;

    const source = currentSource();
    const confirmed = window.confirm(
      `"${source.label}" 전시를 목록에서 삭제할까요?\n(폴더 자체는 삭제되지 않습니다.)`
    );
    if (!confirmed) return;

    try {
      await LocalFolders.deleteFolder(id);
      clearWorksCache(id);
      revokeBlobUrls();
      await populateSourceSelect(DEFAULT_SOURCE);
      updateSourceCopy(currentSource());
      await loadExhibition({ forceRefresh: false });
    } catch (error) {
      window.alert(error?.message || "폴더 전시를 삭제하지 못했습니다.");
    }
  }

  sizeSlider.max = String(PHOTO_MAX_WIDTH);
  sizeSlider.min = String(PHOTO_MIN_WIDTH);
  loadSavedPhotoSize();

  sizeSlider.addEventListener("input", () => {
    applyPhotoSize();
    savePhotoSize();
    scheduleRelayout();
  });

  sourceSelect.addEventListener("change", () => {
    updateFolderButtons();
    loadExhibition({ forceRefresh: false });
  });

  renewBtn.addEventListener("click", () => {
    loadExhibition({ forceRefresh: true });
    document.getElementById("gallery").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });

  if (addFolderBtn) {
    addFolderBtn.addEventListener("click", handleAddFolder);
  }
  if (removeFolderBtn) {
    removeFolderBtn.addEventListener("click", handleRemoveFolder);
  }

  window.addEventListener("resize", scheduleRelayout);

  lightbox.querySelector(".lightbox__close").addEventListener("click", () => {
    lightbox.close();
  });

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) lightbox.close();
  });

  populateSourceSelect(DEFAULT_SOURCE).then(() => {
    updateSourceCopy(currentSource());
    loadExhibition({ forceRefresh: false });
  });
})();
