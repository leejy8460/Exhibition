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

function createGallery({ renew = false } = {}) {
  if (renew || !currentBatchId) {
    currentBatchId = createBatchId();
  }

  applyPhotoSize();

  const columnCount = getColumnCount();
  currentColumnCount = columnCount;

  disconnectObserver();
  grid.replaceChildren();

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < IMAGE_COUNT; i += 1) {
    const row = Math.floor(i / columnCount);
    const [width, height] = ROW_SIZES[row % ROW_SIZES.length];
    const src = `https://picsum.photos/seed/${currentBatchId}-${i + 1}/${width}/${height}`;
    const number = i + 1;
    const label = `No. ${String(number).padStart(2, "0")}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gallery__item";
    button.setAttribute("aria-label", `${label} 크게 보기`);

    const img = document.createElement("img");
    img.src = src;
    img.alt = label;
    img.loading = renew ? "eager" : "lazy";
    img.width = width;
    img.height = height;

    const meta = document.createElement("p");
    meta.className = "gallery__meta";
    meta.textContent = label;

    button.append(img, meta);
    button.addEventListener("click", () => {
      openLightbox(
        `https://picsum.photos/seed/${currentBatchId}-${i + 1}/1200/900`,
        label
      );
    });

    fragment.append(button);
  }

  grid.append(fragment);
  observeItems();
}

function scheduleRelayout() {
  window.clearTimeout(relayoutTimer);
  relayoutTimer = window.setTimeout(() => {
    if (getColumnCount() !== currentColumnCount) {
      createGallery({ renew: false });
    }
  }, 120);
}

function renewExhibition() {
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

  window.requestAnimationFrame(() => {
    createGallery({ renew: true });
    grid.classList.remove("is-renewing");
    renewBtn.disabled = false;
    renewBtn.textContent = "전시 갱신";

    document.getElementById("gallery").scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
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

renewBtn.addEventListener("click", renewExhibition);

createGallery();
