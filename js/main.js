const config = window.CRAFTWOOD_CONFIG || { repo: '', branch: 'main', adminPin: '1234' };

const galleryGrid = document.getElementById('gallery-grid');
const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('.lightbox-img');
const lightboxCaption = lightbox.querySelector('.lightbox-caption');
const menuToggle = document.querySelector('.menu-toggle');
const navLinks = document.querySelector('.nav-links');

let galleryItems = [];
let currentIndex = 0;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function isLocalDev() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1';
}

function resolveAssetPath(path) {
  if (isLocalDev() && config.siteUrl) {
    return `${config.siteUrl.replace(/\/$/, '')}/${path}`;
  }
  return path;
}

function imageSrc(path) {
  return `${encodeURI(resolveAssetPath(path))}?t=${Date.now()}`;
}

function renderGallery() {
  if (!galleryItems.length) {
    galleryGrid.innerHTML = '<p class="gallery-empty">გალერეა ცარიელია.</p>';
    return;
  }

  galleryGrid.innerHTML = galleryItems
    .map(
      (item, index) => `
      <article class="gallery-item" data-index="${index}">
        <img src="${imageSrc(item.src)}" alt="${escapeHtml(item.title)}" loading="lazy">
        <div class="gallery-item-info">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.category)}</p>
        </div>
      </article>
    `
    )
    .join('');

  galleryGrid.querySelectorAll('.gallery-item').forEach((el) => {
    el.addEventListener('click', () => openLightbox(Number(el.dataset.index)));
  });
}

function openLightbox(index) {
  currentIndex = index;
  const item = galleryItems[index];
  lightboxImg.src = imageSrc(item.src);
  lightboxImg.alt = item.title;
  lightboxCaption.textContent = item.title;
  lightbox.classList.add('active');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  lightbox.classList.remove('active');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

function showPrev() {
  currentIndex = (currentIndex - 1 + galleryItems.length) % galleryItems.length;
  openLightbox(currentIndex);
}

function showNext() {
  currentIndex = (currentIndex + 1) % galleryItems.length;
  openLightbox(currentIndex);
}

async function loadGallery() {
  const galleryUrl =
    config.galleryJsonUrl || `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, '/')}/data/gallery.json`;

  try {
    const response = await fetch(`${galleryUrl}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Failed to load gallery');
    const data = await response.json();
    galleryItems = data.items || [];
    renderGallery();
  } catch {
    galleryGrid.innerHTML = '<p class="gallery-empty">გალერეის ჩატვირთვა ვერ მოხერხდა.</p>';
  }
}

lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
lightbox.querySelector('.lightbox-prev').addEventListener('click', showPrev);
lightbox.querySelector('.lightbox-next').addEventListener('click', showNext);

lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});

document.addEventListener('keydown', (e) => {
  if (!lightbox.classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') showPrev();
  if (e.key === 'ArrowRight') showNext();
});

menuToggle.addEventListener('click', () => {
  const isOpen = navLinks.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

navLinks.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
    menuToggle.setAttribute('aria-expanded', 'false');
  });
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadGallery();
});

loadGallery();
