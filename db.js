const DB_NAME = 'PhotoGallery';
const DB_VERSION = 1;
const STORE_NAME = 'images';

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

// Store images in IndexedDB
async function storeImages(imageData) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        const imageId = Date.now() + Math.random().toString(36).substring(7);
        const request = store.put({
            id: imageId,
            images: Array.isArray(imageData) ? imageData : [imageData]
        });

        request.onsuccess = () => resolve(imageId);
        request.onerror = () => reject(request.error);
    });
}

// Get images from IndexedDB
async function getImages(imageId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(imageId);

        request.onsuccess = () => resolve(request.result ? request.result.images : null);
        request.onerror = () => reject(request.error);
    });
}

// Update images in IndexedDB
async function updateImages(imageId, imageData) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put({
            id: imageId,
            images: Array.isArray(imageData) ? imageData : [imageData]
        });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Delete images from IndexedDB
async function deleteImages(imageId) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(imageId);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}