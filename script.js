function openFormPopup(e) {
  if (e) e.stopPropagation();
  document.getElementById('popupForm').style.display = 'flex';
}

function closeFormPopup() {
  document.getElementById('popupForm').style.display = 'none';
}
let editIndex = null;
let currentImageData = null;
let isSaving = false;
function openDetail(detailId) {
  // Hide all photo details
  document.querySelectorAll('.photo-detail').forEach(function(detail) {
    detail.style.display = 'none';
  });

  // Show the selected detail
  const detailEl = document.getElementById(detailId);
  if (!detailEl) return;
  detailEl.style.display = 'flex';

  // Initialize Swiper for this detail if needed (use element nodes so multiple details don't conflict)
  try {
    const swiperContainer = detailEl.querySelector('.detail-swiper');
    if (swiperContainer) {
      const slides = swiperContainer.querySelectorAll('.swiper-slide');
      if (slides.length > 1 && !detailEl._swiperInitialized) {
        const nextEl = detailEl.querySelector('.swiper-button-next');
        const prevEl = detailEl.querySelector('.swiper-button-prev');
        const paginationEl = detailEl.querySelector('.swiper-pagination');

        new Swiper(swiperContainer, {
          slidesPerView: 1,
          spaceBetween: 10,
          navigation: {
            nextEl: nextEl || undefined,
            prevEl: prevEl || undefined,
          },
          pagination: paginationEl ? { el: paginationEl, clickable: true } : undefined,
        });

        // mark initialized so we don't re-create
        detailEl._swiperInitialized = true;
      }
    }
  } catch (err) {
    console.error('openDetail: failed to init swiper for', detailId, err);
  }

  // Fade out the navbar when detail is open
  const navbar = document.querySelector('.navbar-box');
  if (navbar) navbar.style.opacity = '0.3';
}

function closeDetail() {
  document.querySelectorAll('.photo-detail').forEach(function(detail) {
    detail.style.display = 'none';
  });

  // Restore navbar opacity when detail is closed
  const navbar = document.querySelector('.navbar-box');
  if (navbar) navbar.style.opacity = '1';
}

let photoData = [];
let filteredPhotos = [];
let db;

// Initialize IndexedDB
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('PhotoGallery', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('images')) {
        db.createObjectStore('images', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('metadata')) {
        const store = db.createObjectStore('metadata', { keyPath: 'id' });
        store.createIndex('animations', 'animations', { unique: false });
        store.createIndex('order', 'order', { unique: false });
      }
    };
  });
};

// Load data on startup
const loadData = async () => {
  try {
    await initDB();
    const metadataStore = db.transaction('metadata', 'readonly').objectStore('metadata');
    const request = metadataStore.getAll();
    
    request.onsuccess = async () => {
      // Deduplicate metadata by id in case of stale/duplicate entries
      const results = request.result || [];
      const seen = new Map();
      for (const item of results) {
        if (!item || !item.id) continue;
        if (!seen.has(item.id)) seen.set(item.id, item);
      }
      // Sort by order if available
      photoData = Array.from(seen.values())
        .sort((a, b) => {
          // If order exists, use it, otherwise keep original order
          if (typeof a.order === 'number' && typeof b.order === 'number') {
            return a.order - b.order;
          }
          return 0;
        });
      filteredPhotos = [...photoData];
      await renderPhotos();
    };
  } catch (e) {
    console.error('Error loading data:', e);
    photoData = [];
    filteredPhotos = [];
  }
};

loadData();

// Utility: inspect DB contents (non-destructive). Call from console: inspectDb()
window.inspectDb = async function() {
  try {
    await initDB();
    const metas = await new Promise((resolve, reject) => {
      const req = db.transaction('metadata', 'readonly').objectStore('metadata').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    const imgs = await new Promise((resolve, reject) => {
      const req = db.transaction('images', 'readonly').objectStore('images').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });

    console.log('DB metadata count:', metas.length);
    console.log('DB images count:', imgs.length);
    console.log('Metadata entries (sample):', metas.slice(0, 20));
    console.log('Images entries (sample):', imgs.slice(0, 20));

    // Find potential duplicates by content (title|date|location)
    const map = new Map();
    for (const m of metas) {
      const key = `${m.title || ''}|${m.date || ''}|${m.location || ''}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m.id);
    }
    for (const [k, ids] of map.entries()) {
      if (ids.length > 1) console.warn('Possible duplicate metadata for', k, ids);
    }
    return { metas, imgs };
  } catch (err) {
    console.error('inspectDb failed', err);
    throw err;
  }
};

async function renderPhotos() {
  // make sure header is updated for pages without a gallery
  updateHeaderFromSession();
  const imagesArticle = document.querySelector('.images');
  if (!imagesArticle) return; // no gallery on this page
  imagesArticle.querySelectorAll('.photo-card, .photo-detail, .login-message').forEach(el => el.remove());

  // check login session (auth.js provides getSession)
  const session = (typeof getSession === 'function') ? getSession() : null;
  const newCard = imagesArticle.querySelector('.new-image-card');
  if (!session) {
    // hide new image card and show a login prompt (clickable)
    if (newCard) newCard.style.display = 'none';
    const msg = document.createElement('div');
    msg.className = 'login-message';
    const link = document.createElement('a');
    link.href = 'login_page.html';
    link.textContent = 'Please log in to view albums and upload photos.';
    link.style.display = 'inline-block';
    link.style.padding = '24px';
    link.style.color = '#6a1e1e';
    link.style.fontSize = '18px';
    msg.appendChild(link);
    imagesArticle.appendChild(msg);
    return;
  }
  // ensure new-image-card is visible when logged in
  if (newCard) newCard.style.display = 'flex';

  // First deduplicate by id
  const idMap = new Map();
  for (const p of filteredPhotos) {
    if (!p?.id) continue;
    idMap.set(p.id, p);
  }
  const deduped = Array.from(idMap.values());

  // Then filter by owner and search
  const visible = deduped.filter(p => !p.owner || p.owner === session.username);
  const searchInput = document.getElementById('searchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const filteredVisible = query ? visible.filter(p =>
    p.title.toLowerCase().includes(query) ||
    p.date.toLowerCase().includes(query) ||
    p.location.toLowerCase().includes(query) ||
    (p.note && p.note.toLowerCase().includes(query))
  ) : visible;
  
  // Update filteredPhotos with deduplicated and filtered results
  filteredPhotos = filteredVisible;

  // Create photo cards and details
  for (const [idx, photo] of filteredVisible.entries()) {
    // Get images from IndexedDB
    const imageStore = db.transaction('images', 'readonly').objectStore('images');
    const imageData = await new Promise((resolve) => {
      const request = imageStore.get(photo.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });

    // Create card
    const card = document.createElement('div');
    card.className = 'photo-card';
    card.draggable = true;
    card.ondragstart = (e) => dragStart(e, idx);
    card.ondragover = (e) => dragOver(e);
    card.ondrop = (e) => drop(e, idx);
    card.onclick = () => openDetail(`photoDetail${idx}`);

    // Create thumbnail
    const thumb = document.createElement('div');
    thumb.className = 'photo-thumbnail';
    const img = document.createElement('img');
    img.src = imageData ? imageData.images[0] : '';
    img.alt = photo.title;
    thumb.appendChild(img);

    // Create info
    const info = document.createElement('div');
    info.className = 'photo-info';
    info.innerHTML = `
      <h3>${photo.title}</h3>
      <span>${photo.date}</span>
      <span>${photo.location}</span>
      ${imageData && imageData.images.length > 1 ? `<span class="image-count">${imageData.images.length} images</span>` : ''}
    `;
    
    // Assemble card
    card.appendChild(thumb);
    card.appendChild(info);
    imagesArticle.insertBefore(card, imagesArticle.querySelector('.new-image-card'));

    // Create detail view
    const detail = document.createElement('div');
    detail.className = 'photo-detail';
    detail.id = `photoDetail${idx}`;
    detail.style.display = 'none';
    
    // Create swiper slides
    const images = imageData ? imageData.images : [];
    const swiperSlides = images.map(img => `
      <div class="swiper-slide">
        <img src="${img}" alt="${photo.title}" onclick="viewFullPhoto('${img}')" style="cursor: pointer;">
      </div>
    `).join('');

    // Set detail content
    // Format the note text
    const formattedNote = (photo.note || '')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/__(.*?)__/g, '<u>$1</u>')
      .replace(/\n/g, '<br>');

    detail.innerHTML = `
      <div class="detail-content">
        <div class="swiper detail-swiper">
          <div class="swiper-wrapper">
            ${swiperSlides}
          </div>
          ${images.length > 1 ? `
            <div class="swiper-pagination"></div>
            <div class="swiper-button-next"></div>
            <div class="swiper-button-prev"></div>
          ` : ''}
        </div>
        <div class="full-photo-hint">Click to view full photo</div>
        <div class="detail-text">
          <h2>${photo.title}</h2>
          <span>${photo.date} | ${photo.location}</span>
          <p>${formattedNote}</p>
          ${photo.animations?.heart || photo.animations?.gift ? `
            <div class="animation-controls-view">
              ${photo.animations.heart ? `
                <button class="animation-btn heart" onclick="triggerAnimation('heart', this.closest('.detail-content'))">
                  Add Hearts ❤️
                </button>
              ` : ''}
              ${photo.animations.gift ? `
                <button class="animation-btn gift" onclick="triggerAnimation('gift', this.closest('.detail-content'))">
                  Add Gifts 🎁
                </button>
              ` : ''}
            </div>
          ` : ''}
        </div>
        <div id="detail-footer">
          <button class="delete-btn" onclick="deletePhoto(${idx})">Delete</button>
          <button class="edit-btn" onclick="openEditForm(${idx})">Edit</button>
          <button class="back-btn" onclick="closeDetail()">Back</button>
        </div>
      </div>
    `;

    imagesArticle.insertBefore(detail, imagesArticle.querySelector('.new-image-card'));
  }
}

// Update header nav visibility based on session
function updateHeaderFromSession() {
  const session = (typeof getSession === 'function') ? getSession() : null;
  const navLogin = document.getElementById('nav-login');
  const navSignup = document.getElementById('nav-signup');
  const navUser = document.getElementById('nav-user');
  const navUsername = document.getElementById('nav-username');
  const navSignout = document.getElementById('nav-signout');
  if (session) {
    if (navLogin) navLogin.style.display = 'none';
    if (navSignup) navSignup.style.display = 'none';
    if (navUser) navUser.style.display = 'flex';
    if (navUsername) navUsername.textContent = session.username;
    if (navSignout) navSignout.onclick = function() { if (typeof signOut === 'function') signOut(); window.location.reload(); };
  } else {
    if (navLogin) navLogin.style.display = '';
    if (navSignup) navSignup.style.display = '';
    if (navUser) navUser.style.display = 'none';
  }
}

// Initialize Swiper for image previews
let previewSwiper = null;

function initializePreviewSwiper() {
  if (previewSwiper) {
    previewSwiper.destroy(true, true);
  }

  previewSwiper = new Swiper('.image-preview-swiper', {
    slidesPerView: 1,
    spaceBetween: 10,
    navigation: {
      nextEl: '.swiper-button-next',
      prevEl: '.swiper-button-prev',
    },
    pagination: {
      el: '.swiper-pagination',
      clickable: true,
    },
    on: {
      slideChange: function() {
        updateImageCounter(this.activeIndex + 1, this.slides.length);
      },
    },
  });
}

function updateImageCounter(current, total) {
  const currentIndex = document.getElementById('currentImageIndex');
  const totalImages = document.getElementById('totalImages');
  if (currentIndex && totalImages) {
    currentIndex.textContent = current;
    totalImages.textContent = total;
  }
}

document.getElementById('addImageForm').addEventListener('submit', async function(e) {
  e.preventDefault();
  if (isSaving) {
    alert('A save is already in progress. Please wait.');
    return;
  }
  isSaving = true;
  const imageFiles = document.getElementById('imageFile').files;
  const title = document.getElementById('imageTitle').value;
  const date = document.getElementById('imageDate').value;
  const location = document.getElementById('imageLoc').value;
  const note = document.getElementById('imageNote').value;

  // Helper to convert File to base64
  const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Helper to save (for both add and edit)
  async function savePhotos(imageDataArray) {
    const session = (typeof getSession === 'function') ? getSession() : null;
    const timestamp = Date.now();

    if (editIndex === null) {
      // Add new photos: store all selected images under a single metadata record
      const id = `${timestamp}`;
      const animations = {
        heart: document.getElementById('heartAnimation')?.checked || false,
        gift: document.getElementById('giftAnimation')?.checked || false
      };
      const metadata = {
        id,
        title,
        date,
        location,
        note,
        animations,
        owner: session ? session.username : null,
        order: photoData.length // New photos are added at the end
      };

      // Store metadata
      const metadataStore = db.transaction('metadata', 'readwrite').objectStore('metadata');
      await new Promise((resolve, reject) => {
        const request = metadataStore.add(metadata);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Store images array as one entry
      const imageStore = db.transaction('images', 'readwrite').objectStore('images');
      await new Promise((resolve, reject) => {
        const request = imageStore.add({ id, images: imageDataArray });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Update photoData, replacing any existing entry with same id
      const existingIndex = photoData.findIndex(p => p.id === metadata.id);
      if (existingIndex >= 0) {
        photoData[existingIndex] = metadata;
      } else {
        photoData.push(metadata);
      }
    } else {
      // Edit existing - preserve owner if present
      const existing = photoData[editIndex];
      const id = existing.id;
      const metadata = {
        id,
        title,
        date,
        location,
        note,
        owner: existing.owner
      };

      // Update metadata
      const metadataStore = db.transaction('metadata', 'readwrite').objectStore('metadata');
      await new Promise((resolve, reject) => {
        const request = metadataStore.put(metadata);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      // Update image if new one is provided
      if (imageDataArray.length > 0) {
        const imageStore = db.transaction('images', 'readwrite').objectStore('images');
        await new Promise((resolve, reject) => {
          const request = imageStore.put({ id, images: imageDataArray });
          request.onsuccess = () => resolve();
          request.onerror = () => reject(request.error);
        });
      }

      photoData[editIndex] = metadata;
    }

  // Reload freshest data from DB and re-render to avoid race/duplication
  await loadData();
  console.log('savePhotos: reloaded photoData count =', photoData.length);
  closeFormPopup();
  document.getElementById('addImageForm').reset();
  document.getElementById('imagePreview').innerHTML = '';
  editIndex = null;
  currentImageData = null;
    
  // restore popup title and submit text
  const header = document.querySelector('#popupForm .form-popup h2');
  const submitBtn = document.querySelector('#addImageForm button[type="submit"]');
  if (header) header.textContent = 'Add New Image';
  if (submitBtn) submitBtn.textContent = 'Add';
  }

  try {
    if (imageFiles.length > 0) {
      const imageDataPromises = Array.from(imageFiles).map(fileToBase64);
      const imageDataArray = await Promise.all(imageDataPromises);
      await savePhotos(imageDataArray);
    } else if (editIndex !== null && currentImageData) {
      // No new file selected but editing - keep existing images
      await savePhotos(currentImageData);
    }
  } finally {
    isSaving = false;
  }
});

// Handle file selection and preview
document.getElementById('imageFile').addEventListener('change', async function(e) {
  const files = e.target.files;
  const previewContainer = document.getElementById('imagePreview');
  previewContainer.innerHTML = '';

  if (files.length === 0) return;

  // Create slides for each image
  const swiperWrapper = document.createElement('div');
  swiperWrapper.className = 'swiper-wrapper';

  for (const file of files) {
    const slide = document.createElement('div');
    slide.className = 'swiper-slide';
    
    const reader = new FileReader();
    reader.onload = function(event) {
      slide.innerHTML = `
        <img src="${event.target.result}" alt="Preview">
        <button class="preview-delete-btn" onclick="removePreviewImage(this)">×</button>
      `;
    };
    reader.readAsDataURL(file);
    swiperWrapper.appendChild(slide);
  }

  previewContainer.innerHTML = `
    <div class="image-preview-swiper">
      ${swiperWrapper.outerHTML}
      <div class="swiper-pagination"></div>
      <div class="swiper-button-next"></div>
      <div class="swiper-button-prev"></div>
    </div>
    <div class="image-counter">
      <span id="currentImageIndex">1</span>/<span id="totalImages">${files.length}</span>
    </div>
  `;

  initializePreviewSwiper();
});

async function openEditForm(idx) {
  const photo = photoData[idx];
  if (!photo) return;
  editIndex = idx;

  // populate form
  document.getElementById('imageTitle').value = photo.title || '';
  document.getElementById('imageDate').value = photo.date || '';
  document.getElementById('imageLoc').value = photo.location || '';
  document.getElementById('imageNote').value = photo.note || '';

  // Fetch images from IndexedDB
  let images = [];
  try {
    const imageStore = db.transaction('images', 'readonly').objectStore('images');
    const imageData = await new Promise((resolve) => {
      const request = imageStore.get(photo.id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    images = imageData && Array.isArray(imageData.images) ? imageData.images : [];
  } catch (err) {
    console.error('openEditForm: failed to load images for', photo.id, err);
  }

  currentImageData = images.slice(); // keep a copy for editing

  // Create preview for existing images
  const previewContainer = document.getElementById('imagePreview');
  const slides = images.map(img => `
    <div class="swiper-slide">
      <img src="${img}" alt="Preview">
      <button class="preview-delete-btn" onclick="removePreviewImage(this)">×</button>
    </div>
  `).join('');

  previewContainer.innerHTML = `
    <div class="image-preview-swiper">
      <div class="swiper-wrapper">
        ${slides}
      </div>
      <div class="swiper-pagination"></div>
      <div class="swiper-button-next"></div>
      <div class="swiper-button-prev"></div>
    </div>
    <div class="image-counter">
      <span id="currentImageIndex">1</span>/<span id="totalImages">${images.length}</span>
    </div>
  `;

  // change popup title and submit text
  const header = document.querySelector('#popupForm .form-popup h2');
  const submitBtn = document.querySelector('#addImageForm button[type="submit"]');
  if (header) header.textContent = 'Edit Image';
  if (submitBtn) submitBtn.textContent = 'Save';
  document.getElementById('popupForm').style.display = 'flex';

  // Initialize Swiper for preview
  initializePreviewSwiper();
}

async function deletePhoto(idx) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= photoData.length) return;
  const ok = confirm('Are you sure you want to delete this photo?');
  if (!ok) return;
  
  try {
    const photoToDelete = photoData[idx];
    
    // Delete from metadata store
    const metadataStore = db.transaction('metadata', 'readwrite').objectStore('metadata');
    await new Promise((resolve, reject) => {
      const request = metadataStore.delete(photoToDelete.id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Delete from images store
    const imageStore = db.transaction('images', 'readwrite').objectStore('images');
    await new Promise((resolve, reject) => {
      const request = imageStore.delete(photoToDelete.id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Update local arrays
    photoData.splice(idx, 1);
    await filterPhotos();
    
    // Close any open detail modals
    closeDetail();
  } catch (error) {
    console.error('Error deleting photo:', error);
    alert('Failed to delete photo. Please try again.');
  }
}


// Function to try recovering photos from IndexedDB
async function recoverPhotos() {
  try {
    await initDB();
    
    // Get all object stores in the database
    const storeNames = Array.from(db.objectStoreNames);
    console.log('Available stores:', storeNames);

    // Try to recover from metadata store
    const metadataStore = db.transaction('metadata', 'readonly').objectStore('metadata');
    const metadata = await new Promise((resolve, reject) => {
      const request = metadataStore.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    // Try to recover from images store
    const imageStore = db.transaction('images', 'readonly').objectStore('images');
    const images = await new Promise((resolve, reject) => {
      const request = imageStore.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });

    console.log('Found', metadata.length, 'photos in metadata store');
    console.log('Found', images.length, 'photos in images store');

    // Create recovery file with all found data
    const recoveryData = metadata.map(meta => {
      const imageData = images.find(img => img.id === meta.id);
      return {
        ...meta,
        images: imageData ? imageData.images : []
      };
    });

    // Save recovery file
    const dataStr = JSON.stringify(recoveryData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `photo_gallery_recovery_${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    return recoveryData;
  } catch (error) {
    console.error('Recovery error:', error);
    alert('Error during recovery: ' + error.message);
    return null;
  }
}

// Export photoData to JSON file
async function exportData() {
  try {
    const exportData = [];
    
    // Get all metadata
    const metadataStore = db.transaction('metadata', 'readonly').objectStore('metadata');
    const metadata = await new Promise((resolve, reject) => {
      const request = metadataStore.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Get all images
    const imageStore = db.transaction('images', 'readonly').objectStore('images');
    for (const item of metadata) {
      const imageData = await new Promise((resolve, reject) => {
        const request = imageStore.get(item.id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      exportData.push({
        ...item,
        images: imageData.images
      });
    }

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'photo_gallery_data.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    alert('Error exporting data: ' + error.message);
  }
}

// Import photoData from JSON file
async function importData(event) {
  try {
    const file = event.target.files[0];
    if (!file) return;
    
    const fileContent = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });

    const importedData = JSON.parse(fileContent);
    if (!Array.isArray(importedData)) {
      throw new Error('Invalid file format. Please select a valid JSON file.');
    }

    // Validate and normalize the data
    const validatedData = importedData.map(item => {
      if (!item) {
        throw new Error('Found null or undefined item in imported data');
      }
      // Ensure required fields exist
      const normalized = {
        id: item.id || `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: item.title || 'Untitled',
        date: item.date || new Date().toISOString().split('T')[0],
        location: item.location || 'Unknown Location',
        note: item.note || '',
        owner: item.owner || null,
        images: Array.isArray(item.images) ? item.images : []
      };
      // Validate images array is not empty
      if (normalized.images.length === 0) {
        throw new Error('Found item without any images');
      }
      // Validate each image is a valid data URL or path
      normalized.images = normalized.images.filter(img => 
        typeof img === 'string' && (
          img.startsWith('data:image/') || 
          img.startsWith('http://') || 
          img.startsWith('https://') ||
          img.startsWith('/')
        )
      );
      if (normalized.images.length === 0) {
        throw new Error('No valid images found in item');
      }
      return normalized;
    });

    // Clear metadata store
    await new Promise((resolve, reject) => {
      const metadataTx = db.transaction('metadata', 'readwrite');
      const metadataStore = metadataTx.objectStore('metadata');
      const request = metadataStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      metadataTx.oncomplete = () => resolve();
      metadataTx.onerror = () => reject(metadataTx.error);
    });

    // Clear images store
    await new Promise((resolve, reject) => {
      const imagesTx = db.transaction('images', 'readwrite');
      const imageStore = imagesTx.objectStore('images');
      const request = imageStore.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
      imagesTx.oncomplete = () => resolve();
      imagesTx.onerror = () => reject(imagesTx.error);
    });

    // Import new data in chunks to avoid long transactions
    for (let i = 0; i < validatedData.length; i += 10) {
      const chunk = validatedData.slice(i, i + 10);
      
      // Store metadata chunk
      await new Promise((resolve, reject) => {
        const metadataTx = db.transaction('metadata', 'readwrite');
        const metadataStore = metadataTx.objectStore('metadata');
        
        let completed = 0;
        chunk.forEach(item => {
          // Ensure each metadata record has an id
          if (!item.id) {
            item.id = `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          }
          const { images, ...metadata } = item;
          metadata.id = item.id; // Ensure id is copied to metadata
          const request = metadataStore.add(metadata);
          request.onsuccess = () => {
            completed++;
            if (completed === chunk.length) resolve();
          };
          request.onerror = (e) => {
            console.error('Error adding metadata:', e.target.error);
            reject(e.target.error);
          };
        });
        
        metadataTx.oncomplete = () => resolve();
        metadataTx.onerror = (e) => {
          console.error('Metadata transaction error:', e.target.error);
          reject(e.target.error);
        };
      });

      // Store images chunk
      await new Promise((resolve, reject) => {
        const imagesTx = db.transaction('images', 'readwrite');
        const imageStore = imagesTx.objectStore('images');
        
        let completed = 0;
        chunk.forEach(item => {
          // Ensure we have both id and images
          if (!item.id || !Array.isArray(item.images)) {
            console.warn('Skipping invalid image data:', item);
            completed++;
            if (completed === chunk.length) resolve();
            return;
          }
          const request = imageStore.add({ 
            id: item.id,
            images: item.images
          });
          request.onsuccess = () => {
            completed++;
            if (completed === chunk.length) resolve();
          };
          request.onerror = (e) => {
            console.error('Error adding images:', e.target.error);
            reject(e.target.error);
          };
        });
        
        imagesTx.oncomplete = () => resolve();
        imagesTx.onerror = () => reject(imagesTx.error);
      });
    }

    // Update UI
    photoData = validatedData.map(({ images, ...metadata }) => metadata);
    await filterPhotos();
    await renderPhotos();
    alert(`Successfully imported ${validatedData.length} photos!`);
  } catch (error) {
    console.error('Import error:', error);
    alert('Error importing data: ' + error.message);
  }
}

let draggedIndex = null;

function triggerAnimation(type, container) {
  // Create multiple animations
  for (let i = 0; i < 5; i++) {
    setTimeout(() => createAnimation(type, container), i * 200);
  }
}

function dragStart(e, idx) {
  draggedIndex = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', e.target.outerHTML);
  e.target.style.opacity = '0.5';
  e.target.style.cursor = 'grabbing';
}

function dragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

async function drop(e, idx) {
  e.preventDefault();
  if (draggedIndex === null || draggedIndex === idx) return;

  // Reorder filteredPhotos array (which is the visible photos)
  const draggedPhoto = filteredPhotos.splice(draggedIndex, 1)[0];
  filteredPhotos.splice(idx, 0, draggedPhoto);

  // Update photoData with new order
  const session = (typeof getSession === 'function') ? getSession() : null;
  const userPhotos = photoData.filter(p => p.owner === session.username);
  const otherPhotos = photoData.filter(p => !p.owner || p.owner !== session.username);
  photoData = [...otherPhotos, ...filteredPhotos];

  // Update the order in IndexedDB
  const metadataStore = db.transaction('metadata', 'readwrite').objectStore('metadata');
  const updates = photoData.map((photo, index) => {
    return new Promise((resolve, reject) => {
      const updatedPhoto = { ...photo, order: index };
      const request = metadataStore.put(updatedPhoto);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });

  try {
    await Promise.all(updates);
    // Update local data with new orders
    photoData = photoData.map((photo, index) => ({ ...photo, order: index }));
    filteredPhotos = filteredPhotos.map((photo, index) => ({ ...photo, order: index }));
  } catch (error) {
    console.error('Failed to update photo order:', error);
  }

  await renderPhotos();
  draggedIndex = null;
}

function isLandscape(imageSrc) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width > img.height);
    img.onerror = () => resolve(false);
    img.src = imageSrc;
  });
}

function viewFullPhoto(imageSrc) {
  const fullView = document.createElement('div');
  fullView.className = 'full-photo-view';
  fullView.innerHTML = `
    <img src="${imageSrc}" alt="Full Photo">
    <button class="close-full-photo" onclick="closeFullPhoto()">×</button>
  `;
  document.body.appendChild(fullView);
}

function closeFullPhoto() {
  const fullView = document.querySelector('.full-photo-view');
  if (fullView) fullView.remove();
}

async function filterPhotos() {
  const searchInput = document.getElementById('searchInput');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const session = (typeof getSession === 'function') ? getSession() : null;
  filteredPhotos = photoData.filter(photo => {
    const matchesQuery = !query || (
      photo.title.toLowerCase().includes(query) ||
      photo.date.toLowerCase().includes(query) ||
      photo.location.toLowerCase().includes(query) ||
      (photo.note && photo.note.toLowerCase().includes(query))
    );
    const matchesOwner = !photo.owner || (session && photo.owner === session.username);
    return matchesQuery && matchesOwner;
  });
  await renderPhotos();
}

function handleSearch(e) {
  e.preventDefault();
  filterPhotos();
}

function setActiveNav() {
  const currentPath = window.location.pathname.split('/').pop() || 'home.html';
  const navLinks = document.querySelectorAll('.navbar a');
  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === currentPath) {
      link.classList.add('active');
    }
  });
}

function toggleHamburger() {
  const navbar = document.querySelector('.navbar');
  navbar.classList.toggle('open');
}

function applyFormatting(type) {
  const textarea = document.getElementById('imageNote');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const text = textarea.value;
  let formattedText = '';

  switch (type) {
    case 'bold':
      formattedText = text.substring(0, start) + '**' + text.substring(start, end) + '**' + text.substring(end);
      break;
    case 'italic':
      formattedText = text.substring(0, start) + '_' + text.substring(start, end) + '_' + text.substring(end);
      break;
    case 'underline':
      formattedText = text.substring(0, start) + '__' + text.substring(start, end) + '__' + text.substring(end);
      break;
    case 'breakline':
      formattedText = text.substring(0, start) + '\n' + text.substring(end);
      break;
  }

  textarea.value = formattedText;
  const button = event.target.closest('button');
  button.classList.add('active');
  setTimeout(() => button.classList.remove('active'), 200);
}

function createAnimation(type, container) {
  const element = document.createElement('div');
  element.className = `animation-${type}`;
  element.innerHTML = type === 'heart' ? '❤️' : '🎁';
  
  // Random position within the container
  const x = Math.random() * (container.offsetWidth - 30);
  const y = container.offsetHeight - 30;
  
  element.style.left = x + 'px';
  element.style.bottom = y + 'px';
  
  container.appendChild(element);
  
  // Remove element after animation
  element.addEventListener('animationend', () => {
    element.remove();
  });
}

function handleDragOver(e) {
  e.preventDefault();
  e.currentTarget.classList.add('drag-over');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    // Temporarily handle only single file to fix drag conflict
    const fileInput = document.getElementById('imageFile');
    fileInput.files = files;
    // Open the form popup
    openFormPopup();
  }
}

function handleMultipleFiles(files) {
  // Temporarily disabled multiple file selection to fix drag conflict
  // const fileInput = document.getElementById('imageFile');
  // fileInput.files = files;
  // fileInput.dispatchEvent(new Event('change'));
}

window.onload = async function() {
  await renderPhotos();
  setActiveNav();
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      filterPhotos();
      toggleClearButton();
    });
  }
  const clearBtn = document.getElementById('clearBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      searchInput.value = '';
      filterPhotos();
      toggleClearButton();
      searchInput.focus();
    });
  }
  const hamburgerBtn = document.querySelector('.hamburger-btn');
  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', toggleHamburger);
  }
  const newImageCard = document.getElementById('newImageCard');
  if (newImageCard) {
    newImageCard.addEventListener('dragover', handleDragOver);
    newImageCard.addEventListener('dragleave', handleDragLeave);
    newImageCard.addEventListener('drop', handleDrop);
  }
  const fileInput = document.getElementById('imageFile');
  if (fileInput) {
    fileInput.addEventListener('change', function(e) {
      const files = e.target.files;
      if (files.length > 1) {
        // Temporarily disabled multiple file previews to fix drag conflict
        // Handle multiple files, show previews
        // const previewContainer = document.createElement('div');
        // ... (code commented out)
      }
    });
  }
};

function removePreviewImage(button) {
  const slide = button.closest('.swiper-slide');
  const wrapper = slide.parentElement;
  const slideIndex = Array.from(wrapper.children).indexOf(slide);

  // Remove the slide
  previewSwiper.removeSlide(slideIndex);

  // Get the file input and create a new FileList without the removed image
  const fileInput = document.getElementById('imageFile');
  const dt = new DataTransfer();
  Array.from(fileInput.files).forEach((file, index) => {
    if (index !== slideIndex) dt.items.add(file);
  });
  fileInput.files = dt.files;

  // Update the image counter
  if (previewSwiper.slides.length > 0) {
    updateImageCounter(previewSwiper.activeIndex + 1, previewSwiper.slides.length);
  } else {
    // No more images, clear the preview
    document.getElementById('imagePreview').innerHTML = '';
  }
}

function toggleClearButton() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearBtn');
  if (searchInput && clearBtn) {
    if (searchInput.value.trim() !== '') {
      clearBtn.style.display = 'flex';
    } else {
      clearBtn.style.display = 'none';
    }
  }
}
