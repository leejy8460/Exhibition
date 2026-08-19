/** 무료 공개 API 전시 소스 어댑터 */
(function (global) {
  const IMAGE_COUNT = 30;

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  async function mapPool(items, concurrency, worker) {
    const results = [];
    let nextIndex = 0;

    async function run() {
      while (nextIndex < items.length) {
        const current = nextIndex;
        nextIndex += 1;
        const value = await worker(items[current], current);
        if (value) results.push(value);
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, items.length) }, () => run())
    );
    return results;
  }

  const SOURCES = {
    picsum: {
      id: "picsum",
      label: "사진 — Lorem Picsum",
      blurb: "익명의 시선으로 포착한 풍경, 인물, 그리고 고요한 일상.",
      credit: "Lorem Picsum",
      hasMetadata: false,
      async fetchWorks(count) {
        const page = Math.floor(Math.random() * 20) + 1;
        const list = await fetch(
          `https://picsum.photos/v2/list?page=${page}&limit=${count}`
        ).then((response) => response.json());

        return list.map((item, index) => {
          const width = 480;
          const height = [640, 480, 720, 560, 600][index % 5];
          return {
            id: `picsum-${item.id}`,
            imageUrl: `https://picsum.photos/id/${item.id}/${width}/${height}`,
            thumbUrl: `https://picsum.photos/id/${item.id}/320/320`,
            largeUrl: `https://picsum.photos/id/${item.id}/1200/900`,
            title: "",
            artist: item.author || "",
            width,
            height,
          };
        });
      },
      heroUrl() {
        const id = 10 + Math.floor(Math.random() * 80);
        return `https://picsum.photos/id/${id}/1600/1000`;
      },
    },

    met: {
      id: "met",
      label: "미술 — The Met",
      blurb: "메트로폴리탄 미술관 공개 소장품으로 꾸민 가상 전시.",
      credit: "The Metropolitan Museum of Art",
      hasMetadata: true,
      async fetchWorks(count) {
        const queries = [
          "painting",
          "portrait",
          "landscape",
          "still life",
          "flower",
          "sculpture",
        ];
        const query = queries[Math.floor(Math.random() * queries.length)];
        const search = await fetch(
          `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&isPublicDomain=true&q=${encodeURIComponent(query)}`
        ).then((response) => response.json());

        const ids = shuffle(search.objectIDs || []).slice(0, count * 4);
        const works = await mapPool(ids, 6, async (objectId) => {
          try {
            const item = await fetch(
              `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectId}`
            ).then((response) => response.json());
            const imageUrl = item.primaryImageSmall || item.primaryImage;
            if (!imageUrl) return null;
            return {
              id: `met-${item.objectID}`,
              imageUrl,
              thumbUrl: imageUrl,
              largeUrl: item.primaryImage || imageUrl,
              title: item.title || "Untitled",
              artist: item.artistDisplayName || "Unknown artist",
              width: 480,
              height: 640,
            };
          } catch {
            return null;
          }
        });

        return works.slice(0, count);
      },
      heroUrl() {
        return "https://images.metmuseum.org/CRDImages/ep/original/DT1567.jpg";
      },
    },

    nasa: {
      id: "nasa",
      label: "우주 — NASA",
      blurb: "NASA가 공개한 우주와 지구의 기록.",
      credit: "NASA Image and Video Library",
      hasMetadata: true,
      async fetchWorks(count) {
        const queries = ["nebula", "mars", "earth", "moon", "galaxy", "apollo"];
        const query = queries[Math.floor(Math.random() * queries.length)];
        const data = await fetch(
          `https://images-api.nasa.gov/search?q=${encodeURIComponent(query)}&media_type=image`
        ).then((response) => response.json());

        const items = shuffle(data.collection?.items || []);
        const works = [];

        for (const item of items) {
          if (works.length >= count) break;
          const meta = item.data?.[0];
          const imageUrl = item.links?.find((link) => link.render === "image")?.href;
          if (!meta || !imageUrl) continue;
          works.push({
            id: `nasa-${meta.nasa_id || works.length}`,
            imageUrl,
            thumbUrl: imageUrl,
            largeUrl: imageUrl,
            title: meta.title || "Untitled",
            artist: meta.photographer || meta.secondary_creator || "NASA",
            width: 480,
            height: 480,
          });
        }

        return works;
      },
      heroUrl() {
        return "https://images-assets.nasa.gov/image/PIA08621/PIA08621~large.jpg";
      },
    },
  };

  global.ExhibitionSources = {
    IMAGE_COUNT,
    SOURCES,
    getSource(id) {
      return SOURCES[id] || SOURCES.picsum;
    },
    listSources() {
      return Object.values(SOURCES);
    },
  };
})(window);
