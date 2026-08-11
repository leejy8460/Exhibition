const IMAGE_COUNT = 30;
const TITLES = [
  "새벽 안개",
  "창가의 그림자",
  "고요한 해안",
  "골목의 빛",
  "고요한 방",
  "바람의 결",
  "먼 언덕",
  "비 온 뒤",
  "저녁 기차",
  "흰 커튼",
  "도시의 숨",
  "얇은 구름",
  "오래된 문",
  "푸른 잔디",
  "유리 너머",
  "느린 오후",
  "돌계단",
  "나뭇잎 사이",
  "빈 의자",
  "노을 직전",
  "물결 자국",
  "따뜻한 벽",
  "조용한 거리",
  "열린 창문",
  "석양 아래",
  "먼 섬",
  "회색 하늘",
  "작은 정원",
  "밤의 가장자리",
  "아침 식탁",
];

const SIZES = [
  [480, 640],
  [480, 480],
  [480, 720],
  [480, 560],
  [480, 600],
];

const grid = document.getElementById("gallery-grid");
const renewBtn = document.getElementById("renew-btn");
const heroImage = document.querySelector(".hero__image");
const lightbox = document.getElementById("lightbox");
const lightboxImage = document.getElementById("lightbox-image");
const lightboxCaption = document.getElementById("lightbox-caption");

let itemObserver = null;

function createBatchId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function disconnectObserver() {
  if (itemObserver) {
    itemObserver.disconnect();
    itemObserver = null;
  }
}

function createGallery({ renew = false } = {}) {
  const batchId = createBatchId();
  const titles = renew ? shuffle(TITLES) : TITLES;

  disconnectObserver();
  grid.replaceChildren();

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < IMAGE_COUNT; i += 1) {
    const [width, height] = SIZES[i % SIZES.length];
    const seed = `${batchId}-${i + 1}`;
    const src = `https://picsum.photos/seed/${seed}/${width}/${height}`;
    const title = titles[i];
    const label = `No. ${String(i + 1).padStart(2, "0")}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "gallery__item";
    button.setAttribute("aria-label", `${label} ${title} 크게 보기`);

    const img = document.createElement("img");
    img.src = src;
    img.alt = title;
    img.loading = renew ? "eager" : "lazy";
    img.width = width;
    img.height = height;

    const meta = document.createElement("p");
    meta.className = "gallery__meta";
    meta.textContent = `${label} · ${title}`;

    button.append(img, meta);
    button.addEventListener("click", () => {
      openLightbox(src, `${label} · ${title}`);
    });

    fragment.append(button);
  }

  grid.append(fragment);
  observeItems();
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

function openLightbox(src, caption) {
  lightboxImage.src = src.replace(/\/\d+\/\d+$/, "/1200/900");
  lightboxImage.alt = caption;
  lightboxCaption.textContent = caption;
  lightbox.showModal();
}

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
