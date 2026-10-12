/** 로컬 폴더 전시 (File System Access API + IndexedDB) */
(function (global) {
  const DB_NAME = "atelier-nord-local-folders";
  const DB_VERSION = 1;
  const STORE = "folders";
  const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(mode, fn) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const store = tx.objectStore(STORE);
      Promise.resolve(fn(store))
        .then((value) => {
          tx.oncomplete = () => resolve(value);
          tx.onerror = () => reject(tx.error);
        })
        .catch(reject);
    });
  }

  function supportsDirectoryPicker() {
    return typeof window.showDirectoryPicker === "function";
  }

  async function listFolders() {
    return withStore("readonly", (store) => {
      return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    });
  }

  async function getFolder(id) {
    return withStore("readonly", (store) => {
      return new Promise((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    });
  }

  async function saveFolder(record) {
    return withStore("readwrite", (store) => {
      store.put(record);
    });
  }

  async function deleteFolder(id) {
    return withStore("readwrite", (store) => {
      store.delete(id);
    });
  }

  async function ensurePermission(handle) {
    const options = { mode: "read" };
    if ((await handle.queryPermission(options)) === "granted") {
      return true;
    }
    return (await handle.requestPermission(options)) === "granted";
  }

  async function pickAndAddFolder() {
    if (!supportsDirectoryPicker()) {
      throw new Error(
        "이 브라우저는 로컬 폴더 선택을 지원하지 않습니다. Chrome 또는 Edge를 사용해 주세요."
      );
    }

    const handle = await window.showDirectoryPicker({ mode: "read" });
    const granted = await ensurePermission(handle);
    if (!granted) {
      throw new Error("폴더 접근 권한이 필요합니다.");
    }

    const id = `local-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;
    const record = {
      id,
      name: handle.name || "Local folder",
      handle,
      addedAt: Date.now(),
    };
    await saveFolder(record);
    return record;
  }

  function shuffle(list) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function titleFromFileName(name) {
    return name.replace(/\.[^.]+$/, "") || name;
  }

  async function collectImageFiles(dirHandle) {
    const files = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== "file") continue;
      if (!IMAGE_EXT.test(entry.name)) continue;
      files.push(entry);
    }
    return files;
  }

  async function fetchWorksFromFolder(record, count) {
    const granted = await ensurePermission(record.handle);
    if (!granted) {
      throw new Error(
        `"${record.name}" 폴더 권한이 없습니다. 폴더를 다시 추가해 주세요.`
      );
    }

    const fileHandles = await collectImageFiles(record.handle);
    if (fileHandles.length === 0) {
      throw new Error(`"${record.name}" 폴더에 이미지 파일이 없습니다.`);
    }

    const picked = shuffle(fileHandles).slice(0, count);
    const works = [];

    for (const fileHandle of picked) {
      const file = await fileHandle.getFile();
      const objectUrl = URL.createObjectURL(file);
      works.push({
        id: `${record.id}-${file.name}-${file.lastModified}`,
        imageUrl: objectUrl,
        thumbUrl: objectUrl,
        largeUrl: objectUrl,
        title: titleFromFileName(file.name),
        artist: record.name,
        width: 480,
        height: 640,
        isLocalBlob: true,
      });
    }

    return works;
  }

  function createLocalSource(record) {
    return {
      id: record.id,
      label: `로컬 — ${record.name}`,
      blurb: `이 컴퓨터의 "${record.name}" 폴더에서 고른 이미지 전시입니다.`,
      credit: `Local folder: ${record.name}`,
      hasMetadata: true,
      isLocal: true,
      async fetchWorks(count) {
        return fetchWorksFromFolder(record, count);
      },
      heroUrl() {
        return "";
      },
    };
  }

  global.ExhibitionLocalFolders = {
    supportsDirectoryPicker,
    listFolders,
    getFolder,
    pickAndAddFolder,
    deleteFolder,
    createLocalSource,
    isLocalSourceId(id) {
      return typeof id === "string" && id.startsWith("local-");
    },
  };
})(window);
