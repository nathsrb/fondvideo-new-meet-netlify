// SCELYO Studio projects are stored entirely on this device.
// Media is stored separately so subtitle edits never rewrite a large video Blob.
const DB_NAME = 'scelyo-studio-projects';
const DB_VERSION = 1;

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Ce navigateur ne permet pas la sauvegarde locale des projets.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('media')) db.createObjectStore('media');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Stockage local indisponible.'));
  });
}

async function transact(stores, mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let result;
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error || new Error('Sauvegarde locale impossible.')); };
    tx.onabort = () => { const error = tx.error; db.close(); reject(error || new Error('Sauvegarde locale annulée.')); };
    try {
      const request = action(tx);
      if (request) request.onsuccess = () => { result = request.result; };
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

export function listStudioProjects() {
  return transact(['projects'], 'readonly', tx => tx.objectStore('projects').getAll())
    .then(records => (records || []).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)));
}
export function saveStudioProject(project) {
  return transact(['projects'], 'readwrite', tx => tx.objectStore('projects').put(project));
}
export function saveStudioVideo(id, file) {
  return transact(['media'], 'readwrite', tx => tx.objectStore('media').put(file, id + ':video'));
}
export function getStudioVideo(id) {
  return transact(['media'], 'readonly', tx => tx.objectStore('media').get(id + ':video'));
}
export function saveStudioBackground(id, file) {
  return transact(['media'], 'readwrite', tx => tx.objectStore('media').put(file, id + ':background'));
}
export function getStudioBackground(id) {
  return transact(['media'], 'readonly', tx => tx.objectStore('media').get(id + ':background'));
}
export function deleteStudioProject(id) {
  return transact(['projects', 'media'], 'readwrite', tx => {
    tx.objectStore('media').delete(id + ':video');
    tx.objectStore('media').delete(id + ':background');
    return tx.objectStore('projects').delete(id);
  });
}
