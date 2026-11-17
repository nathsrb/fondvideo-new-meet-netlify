// SCELYO Studio: local-only project metadata + media storage.
// Exported project methods never contact Netlify.
export type StudioProjectRecord = {
  id: string;
  name: string;
  videoName: string;
  videoSize: number;
  videoStored: boolean;
  updatedAt: number;
  settings: Record<string, unknown>;
  captions: Record<string, unknown>;
  textLayers: Record<string, unknown>[];
};

const DB_NAME = 'scelyo-studio-projects';
const DB_VERSION = 2;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Ce navigateur ne permet pas la sauvegarde locale des projets.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      const tx = request.transaction;
      if (!tx) throw new Error('Migration du stockage impossible.');
      const projects = db.objectStoreNames.contains('projects')
        ? tx.objectStore('projects')
        : db.createObjectStore('projects', { keyPath: 'id' });
      const media = db.objectStoreNames.contains('media')
        ? tx.objectStore('media')
        : db.createObjectStore('media');

      // Older SCELYO V15 stored the editable video directly in the project's
      // record. Keep projects from that same preview origin when switching to
      // V16's separate media store, atomically in the IndexedDB upgrade.
      const cursorRequest = projects.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const oldProject = cursor.value;
        if (oldProject && !oldProject.videoName && oldProject.video instanceof Blob) {
          const video = oldProject.video as Blob & { name?: string };
          media.put(video, oldProject.id + ':video');
          const { video: _legacyVideo, text: legacyText, ...metadata } = oldProject;
          cursor.update({
            ...metadata,
            videoName: video.name || metadata.name || 'video.mp4',
            videoSize: video.size,
            videoStored: true,
            settings: metadata.settings || {},
            captions: metadata.captions || {},
            textLayers: Array.isArray(legacyText) ? legacyText : [],
          });
        }
        cursor.continue();
      };
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Stockage local indisponible.'));
  });
}

async function transact<T>(
  stores: string[],
  mode: IDBTransactionMode,
  action: (tx: IDBTransaction) => IDBRequest<T>
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    let result: T;
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => {
      const error = tx.error;
      db.close();
      reject(error || new Error('Sauvegarde locale impossible.'));
    };
    tx.onabort = () => {
      const error = tx.error;
      db.close();
      reject(error || new Error('Sauvegarde locale annulée.'));
    };
    try {
      const request = action(tx);
      request.onsuccess = () => { result = request.result; };
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

export function listStudioProjects(): Promise<StudioProjectRecord[]> {
  return transact<StudioProjectRecord[]>(['projects'], 'readonly', tx => tx.objectStore('projects').getAll())
    .then(records => records.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
}
export function saveStudioProject(project: StudioProjectRecord): Promise<IDBValidKey> {
  return transact<IDBValidKey>(['projects'], 'readwrite', tx => tx.objectStore('projects').put(project));
}
export function saveStudioVideo(id: string, file: File | Blob): Promise<IDBValidKey> {
  return transact<IDBValidKey>(['media'], 'readwrite', tx => tx.objectStore('media').put(file, id + ':video'));
}
export function getStudioVideo(id: string): Promise<File | Blob | undefined> {
  return transact<File | Blob | undefined>(['media'], 'readonly', tx => tx.objectStore('media').get(id + ':video'));
}
export function saveStudioBackground(id: string, file: File | Blob): Promise<IDBValidKey> {
  return transact<IDBValidKey>(['media'], 'readwrite', tx => tx.objectStore('media').put(file, id + ':background'));
}
export function getStudioBackground(id: string): Promise<File | Blob | undefined> {
  return transact<File | Blob | undefined>(['media'], 'readonly', tx => tx.objectStore('media').get(id + ':background'));
}
export function deleteStudioProject(id: string): Promise<undefined> {
  return transact<undefined>(['projects', 'media'], 'readwrite', tx => {
    tx.objectStore('media').delete(id + ':video');
    tx.objectStore('media').delete(id + ':background');
    return tx.objectStore('projects').delete(id);
  });
}
