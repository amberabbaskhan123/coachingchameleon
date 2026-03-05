const DB_NAME = "coaching_chameleon_audio_v1";
const DB_VERSION = 1;
const STORE_NAME = "session_audio";

type StoredAudioRecord = {
  sessionId: string;
  mimeType: string;
  blob: Blob;
  createdAt: string;
};

const openAudioDb = async (): Promise<IDBDatabase | null> => {
  if (typeof indexedDB === "undefined") return null;

  return await new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
};

export const storeSessionAudio = async (
  sessionId: string,
  blob: Blob,
  mimeType: string,
) => {
  const db = await openAudioDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const record: StoredAudioRecord = {
      sessionId,
      blob,
      mimeType,
      createdAt: new Date().toISOString(),
    };
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });

  db.close();
};

export const getSessionAudio = async (sessionId: string): Promise<Blob | null> => {
  const db = await openAudioDb();
  if (!db) return null;

  const record = await new Promise<StoredAudioRecord | null>((resolve) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(sessionId);
    request.onsuccess = () => resolve((request.result as StoredAudioRecord) ?? null);
    request.onerror = () => resolve(null);
  });

  db.close();
  return record?.blob ?? null;
};
