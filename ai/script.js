const IMAGE_COUNT = 30;

/** Picsum에서 받는 원본 가로 크기(= 화면 표시 최대 크기) */
const PHOTO_MAX_WIDTH = 480;

/** 가로줄마다 다른 세로 비율. 같은 줄의 사진끼리는 동일한 크기 */
const ROW_SIZES = [
  [PHOTO_MAX_WIDTH, 640],
  [PHOTO_MAX_WIDTH, 480],
  [PHOTO_MAX_WIDTH, 720],
  [PHOTO_MAX_WIDTH, 560],
  [PHOTO_MAX_WIDTH, 600],
];

const grid = document.getElementById("gallery-grid");
const renewBtn = document.getElementById("renew-btn");
const sizeSlider = document.getElementById("size-slider");
const heroImage = document.querySelector(".hero__image");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");

let itemObserver = null;
let currentBatchId = null;
let currentColumnCount = null;
let relayoutTimer = null;
let captionRequestId = 0;
const titlesById = new Map();

function createBatchId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

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

function formatCaption(label, title) {
  return title ? `${label} · ${title}` : `${label} · …`;
}

function captionImageUrl(seed, width, height) {
  const scale = Math.min(1, 320 / width);
  const w = Math.max(160, Math.round(width * scale));
  const h = Math.max(160, Math.round(height * scale));
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
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

  return { captions };
}

function applyTitlesToDom() {
  grid.querySelectorAll(".gallery__item").forEach((button) => {
    const id = button.dataset.imageId;
    const label = button.dataset.label;
    const title = titlesById.get(id) || "";
    const caption = formatCaption(label, title);
    const meta = button.querySelector(".gallery__meta");
    const img = button.querySelector("img");

    if (meta) meta.textContent = caption;
    if (img) img.alt = caption;
    button.setAttribute("aria-label", `${caption} 크게 보기`);
    button.dataset.caption = caption;
  });
}

async function createGallery({ renew = false } = {}) {
  if (renew || !currentBatchId) {
    currentBatchId = createBatchId();
  }

  if (renew) {
    titlesById.clear();
  }

  applyPhotoSize();

  const columnCount = getColumnCount();
  currentColumnCount = columnCount;

  disconnectObserver();
  grid.replaceChildren();

  const fragment = document.createDocumentFragment();
  const missing = [];

  for (let i = 0; i < IMAGE_COUNT; i += 1) {
    const row = Math.floor(i / columnCount);
    const [width, height] = ROW_SIZES[row % ROW_SIZES.length];
    const seed = `${currentBatchId}-${i + 1}`;
    const imageId = seed;
    const src = `https://picsum.photos/seed/${seed}/${width}/${height}`;
    const number = i + 1;
    const label = `No. ${String(number).padStart(2, "0")}`;
    const existingTitle = titlesById.get(imageId) || "";
    const caption = formatCaption(label, existingTitle);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gallery__item";
    button.dataset.imageId = imageId;
    button.dataset.label = label;
    button.dataset.caption = caption;
    button.setAttribute("aria-label", `${caption} 크게 보기`);

    const img = document.createElement("img");
    img.src = src;
    img.alt = caption;
    img.loading = renew ? "eager" : "lazy";
    img.width = width;
    img.height = height;

    const meta = document.createElement("p");
    meta.className = "gallery__meta";
    meta.textContent = caption;

    button.append(img, meta);
    button.addEventListener("click", () => {
      openLightbox(
        `https://picsum.photos/seed/${seed}/1200/900`,
        button.dataset.caption || caption
      );
    });

    fragment.append(button);

    if (!existingTitle) {
      missing.push({
        id: imageId,
        url: captionImageUrl(seed, width, height),
      });
    }
  }

  grid.append(fragment);
  observeItems();

  if (missing.length === 0) return;

  const requestId = ++captionRequestId;

  try {
    const { captions } = await fetchCaptionsInBatches(missing);
    if (requestId !== captionRequestId) return;

    captions.forEach((item) => {
      if (item?.id && item?.title) {
        titlesById.set(item.id, item.title);
      }
    });

    applyTitlesToDom();
  } catch (error) {
    if (requestId !== captionRequestId) return;
    console.error(error);
    grid.querySelectorAll(".gallery__item").forEach((button) => {
      const label = button.dataset.label;
      const meta = button.querySelector(".gallery__meta");
      if (meta && !titlesById.has(button.dataset.imageId)) {
        meta.textContent = label;
        button.dataset.caption = label;
      }
    });
  }
}

function scheduleRelayout() {
  window.clearTimeout(relayoutTimer);
  relayoutTimer = window.setTimeout(() => {
    if (getColumnCount() !== currentColumnCount) {
      createGallery({ renew: false });
    }
  }, 120);
}

async function renewExhibition() {
  if (renewBtn.disabled) return;

  renewBtn.disabled = true;
  renewBtn.textContent = "불러오는 중…";
  grid.classList.add("is-renewing");

  if (lightbox.open) {
    lightbox.close();
  }

  if (heroImage) {
    heroImage.src = `https://picsum.photos/seed/atelier-nord-hero-${createBatchId()}/1600/1000`;
  }

  try {
    await createGallery({ renew: true });
  } finally {
    grid.classList.remove("is-renewing");
    renewBtn.disabled = false;
    renewBtn.textContent = "전시 갱신";
  }

  document.getElementById("gallery").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
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

function openLightbox(src, label) {
  lightboxImage.src = src;
  lightboxImage.alt = label;
  lightbox.showModal();
}

sizeSlider.max = String(PHOTO_MAX_WIDTH);
sizeSlider.addEventListener("input", () => {
  applyPhotoSize();
  scheduleRelayout();
});

window.addEventListener("resize", () => {
  scheduleRelayout();
});

lightbox.querySelector(".lightbox__close").addEventListener("click", () => {
  lightbox.close();
});

lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    lightbox.close();
  }
});

renewBtn.addEventListener("click", () => {
  renewExhibition();
});

createGallery();
