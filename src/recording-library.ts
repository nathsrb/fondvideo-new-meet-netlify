export type SavedRecording = { id: string; name: string; mime: string; blob: Blob; size: number; createdAt: number };

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('Stockage local non disponible.'));
    const request = indexedDB.open('fondvideo-new-meet-recordings', 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('recordings')) {
        request.result.createObjectStore('recordings', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Erreur de stockage.'));
  });
}

export async function saveRecording(blob: Blob, name: string) {
  if (!blob.size) throw new Error('Fichier vide.');
  const entry: SavedRecording = { id: crypto.randomUUID(), name, mime: blob.type, size: blob.size, blob, createdAt: Date.now() };
  const db = await openDB();
  return new Promise<SavedRecording>((resolve, reject) => {
    const tx = db.transaction('recordings', 'readwrite');
    tx.objectStore('recordings').put(entry);
    tx.oncomplete = () => { db.close(); resolve(entry); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Sauvegarde impossible.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Stockage interrompu.')); };
  });
}

export async function listRecordings() {
  const db = await openDB();
  return new Promise<SavedRecording[]>((resolve, reject) => {
    const tx = db.transaction('recordings', 'readonly');
    const query = tx.objectStore('recordings').getAll();
    query.onsuccess = () => resolve((query.result as SavedRecording[]).sort((a, b) => b.createdAt - a.createdAt));
    query.onerror = () => reject(query.error || new Error('Lecture impossible.'));
    tx.oncomplete = () => db.close();
  });
}

export async function deleteRecording(id: string) {
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('recordings', 'readwrite');
    tx.objectStore('recordings').delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Suppression impossible.')); };
  });
}
