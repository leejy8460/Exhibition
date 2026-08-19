/** 공통 전시 갤러리 앱 */
(function () {
  const {
    IMAGE_COUNT,
    getSource,
    listSources,
  } = window.ExhibitionSources;

  const USE_AI = Boolean(window.EXHIBITION_USE_AI);
  const PHOTO_MAX_WIDTH = 480;
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

  function getPhotoSize() {
    return Number(sizeSlider.value);
  }

  function applyPhotoSize() {
    const size = Math.min(getPhotoSize(), PHOTO_MAX_WIDTH);
    const sizePx = `${size}px`;
    grid.style.setProperty("--photo-size", sizePx);
    document.documentElement.style.setProperty("--photo-size", sizePx);
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
    sourceSelect.value = "picsum";
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

  function renderWorks(works, { pendingAi = false } = {}) {
    const columnCount = getColumnCount();
    currentColumnCount = columnCount;
    disconnectObserver();
    grid.replaceChildren();

    const fragment = document.createDocumentFragment();

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
      img.src = work.imageUrl;
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
    });

    grid.append(fragment);
    observeItems();
  }

  function applyAiTitles(captions) {
    const byId = new Map(
      captions.filter((item) => item?.id && item?.title).map((item) => [item.id, item.title])
    );

    currentWorks = currentWorks.map((work) => {
      const title = byId.get(work.id);
      return title ? { ...work, title } : work;
    });

    renderWorks(currentWorks);
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
      applyAiTitles(captions);
    } catch (error) {
      console.error(error);
      if (requestId !== captionRequestId) return;
      renderWorks(currentWorks);
    }
  }

  async function loadExhibition({ renewHero = true } = {}) {
    if (loading) return;
    loading = true;

    const source = currentSource();
    updateSourceCopy(source);
    applyPhotoSize();

    renewBtn.disabled = true;
    sourceSelect.disabled = true;
    renewBtn.textContent = "불러오는 중…";
    grid.classList.add("is-renewing");

    if (lightbox.open) lightbox.close();

    try {
      if (renewHero && heroImage) {
        heroImage.src = source.heroUrl();
      }

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

      currentWorks = works.slice(0, IMAGE_COUNT);

      if (renewHero && heroImage && currentWorks[0]) {
        heroImage.src = currentWorks[0].largeUrl || currentWorks[0].imageUrl;
      }

      const pendingAi = USE_AI && !source.hasMetadata;
      renderWorks(currentWorks, { pendingAi });
      await maybeGenerateAiTitles(source, currentWorks);
    } catch (error) {
      console.error(error);
      grid.innerHTML =
        '<p class="gallery__error">전시를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>';
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
        const pendingAi = USE_AI && !source.hasMetadata && currentWorks.some((work) => !work.title);
        renderWorks(currentWorks, { pendingAi });
      }
    }, 120);
  }

  function openLightbox(src, caption, artist) {
    lightboxImage.src = src;
    lightboxImage.alt = caption;
    if (lightboxCaption) {
      lightboxCaption.textContent = artist ? `${caption} — ${artist}` : caption;
    }
    lightbox.showModal();
  }

  sizeSlider.max = String(PHOTO_MAX_WIDTH);
  populateSourceSelect();
  updateSourceCopy(currentSource());

  sizeSlider.addEventListener("input", () => {
    applyPhotoSize();
    scheduleRelayout();
  });

  sourceSelect.addEventListener("change", () => {
    loadExhibition({ renewHero: true });
  });

  renewBtn.addEventListener("click", () => {
    loadExhibition({ renewHero: true });
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

  loadExhibition({ renewHero: false });
})();
