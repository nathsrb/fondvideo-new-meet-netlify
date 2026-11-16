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
const DB_VERSION = 1;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Ce navigateur ne permet pas la sauvegarde locale des projets.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects'))
        db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media'))
        db.createObjectStore('media');
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
