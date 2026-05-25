const DB_NAME = 'nexus-reports';
const DB_VERSION = 1;
const STORE_NAME = 'reports';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function saveReport(meta, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ ...meta, _blob: blob });
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

export async function getReports() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = e => {
      const rows = (e.target.result || []).map(({ _blob, ...rest }) => rest);
      resolve(rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
    };
    req.onerror = e => reject(e.target.error);
  });
}

export async function getReportBlob(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(id);
    req.onsuccess = e => resolve(e.target.result?._blob || null);
    req.onerror   = e => reject(e.target.error);
  });
}

export async function deleteLocalReport(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}
