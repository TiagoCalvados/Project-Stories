// Device-only handoff between the two music apps. No network requests or cloud storage.
const DB = 'project-stories-music', STORE = 'takes';
export const TAKE_LIMIT = 20, BYTE_LIMIT = 96 * 1024 * 1024;
let opening;
function database() {
  if (!globalThis.indexedDB) return Promise.reject(Error('Recent recordings are unavailable in this browser. Download your WAV instead.'));
  if (!opening) opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); opening = null; }; resolve(db); };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('Close other music tabs and try again.'));
  }).catch(error => { opening = null; throw error; });
  return opening;
}
export async function recentTakes() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result.map(({ blob, ...metadata }) => metadata).sort((a, b) => b.createdAt - a.createdAt));
    request.onerror = () => reject(request.error);
  });
}
export async function readTake(id) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
  });
}
export async function saveTake({ name, blob, duration }) {
  const db = await database(), id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const take = { id, name, blob, duration, bytes: blob.size, createdAt: Date.now(), source: 'TCKO2' };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE), request = store.getAll();
    let problem;
    request.onsuccess = () => {
      if (request.result.length >= TAKE_LIMIT || request.result.reduce((sum, row) => sum + row.bytes, 0) + blob.size > BYTE_LIMIT) {
        problem = Error('Recent recording storage is full. Download this WAV and open it in TCKO3.'); tx.abort(); return;
      }
      store.add(take);
    };
    tx.oncomplete = resolve; tx.onerror = () => reject(problem || tx.error || Error('Could not keep this take in the browser.'));
    tx.onabort = () => reject(problem || tx.error || Error('Could not keep this take in the browser.'));
  });
  try { localStorage.setItem('music-takes-updated', String(Date.now())); } catch {}
  globalThis.dispatchEvent?.(new Event('music-takes-changed'));
  return id;
}
