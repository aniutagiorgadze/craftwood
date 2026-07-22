const featuredGrid = document.getElementById('featured-grid');
const galleryGrid = document.getElementById('gallery-grid');
const materialsGrid = document.getElementById('materials-grid');
const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('.lightbox-img');
const lightboxCaption = lightbox.querySelector('.lightbox-caption');
const lightboxReviews = document.getElementById('lightbox-reviews');
const reviewForm = document.getElementById('review-form');
const reviewAuthor = document.getElementById('review-author');
const reviewText = document.getElementById('review-text');
const reviewRating = document.getElementById('review-rating');
const reviewStars = document.getElementById('review-stars');
const reviewFormNote = document.getElementById('review-form-note');
const consultationForm = document.getElementById('consultation-form');
const requestPhone = document.getElementById('request-phone');
const requestMessage = document.getElementById('request-message');
const consultationFormNote = document.getElementById('consultation-form-note');
const sidebar = document.getElementById('sidebar');
const menuToggle = document.getElementById('menu-toggle');
const sidebarClose = document.getElementById('sidebar-close');
const config = window.CRAFTWOOD_CONFIG || {};
const reviewsApi = window.CraftwoodReviews;
const requestsApi = window.CraftwoodRequests;

let siteData = {};
let galleryItems = [];
let allReviews = [];
let lightboxItems = [];
let currentIndex = 0;
let currentView = 'featured';

const DEFAULT_SITE = {
  brand: { name: 'Craftwood' },
  sections: {
    featured: { title: 'განსაკუთრებული ნამუშევრები', subtitle: '' },
    gallery: { title: 'სრული ნამუშევრები', subtitle: '' },
  },
  about: { title: 'Craftwood', paragraphs: [], features: [], image: 'images/placeholder-1.svg' },
  consultation: {
    title: 'შეუკვეთე კონსულტაცია',
    description: '',
    phone: '',
    email: '',
    buttonText: 'დაგვიკავშირდით',
  },
  materials: { title: 'მასალები', subtitle: '', items: [] },
};

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatReviewDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ka-GE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function renderStars(rating) {
  const filled = Math.max(0, Math.min(5, Number(rating) || 0));
  return Array.from({ length: 5 }, (_, i) => {
    const cls = i < filled ? 'review-stars-star is-filled' : 'review-stars-star';
    return `<span class="${cls}" aria-hidden="true">★</span>`;
  }).join('');
}

function getItemComments(item) {
  if (!item || !reviewsApi) return [];
  return reviewsApi.getVisibleReviewsForItem(allReviews, item.src);
}

function renderCommentsList(comments) {
  if (!comments.length) {
    return '<p class="reviews-empty">ჯერ შეფასება არ არის. იყავით პირველი!</p>';
  }

  return comments
    .map(
      (c) => `
      <article class="review-card">
        <div class="review-card-head">
          <strong>${escapeHtml(c.author || 'სტუმარი')}</strong>
          <span class="review-stars">${renderStars(c.rating)}</span>
        </div>
        <p class="review-card-text">${escapeHtml(c.text || '')}</p>
        ${c.date ? `<time class="review-card-date">${escapeHtml(formatReviewDate(c.date))}</time>` : ''}
      </article>
    `
    )
    .join('');
}

function galleryCardHtml(item, index) {
  const comments = getItemComments(item);
  const count = comments.length;
  const avg = reviewsApi ? reviewsApi.getAverageRating(comments) : 0;
  const starsHtml =
    count > 0
      ? `<span class="gallery-card-rating" aria-label="${avg} ვარსკვლავი">${renderStars(avg)} <span class="gallery-card-rating-count">(${count})</span></span>`
      : `<span class="gallery-card-hint">★ დატოვე შეფასება</span>`;

  return `
    <article class="gallery-item" data-index="${index}">
      <img src="${encodeURI(item.src)}" alt="${escapeHtml(item.title)}" loading="lazy">
      <div class="gallery-item-info">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.category)}</p>
        ${starsHtml}
      </div>
    </article>
  `;
}

function bindGalleryGrid(gridEl, items, emptyText = 'ნამუშევრები ჯერ არ არის.') {
  if (!items.length) {
    gridEl.innerHTML = `<p class="page-empty">${emptyText}</p>`;
    return;
  }

  gridEl.innerHTML = items.map((item, i) => galleryCardHtml(item, i)).join('');

  gridEl.querySelectorAll('.gallery-item').forEach((el) => {
    el.addEventListener('click', () => {
      lightboxItems = items;
      openLightbox(Number(el.dataset.index));
    });
  });
}

function renderFeaturedGrid() {
  const featured = galleryItems.filter((item) => item.featured);
  bindGalleryGrid(featuredGrid, featured);
}

function renderFullGallery() {
  const regular = galleryItems.filter((item) => !item.featured);
  bindGalleryGrid(galleryGrid, regular, 'შინაარსი მალე დაემატება.');
}

function renderMaterials() {
  const materials = siteData.materials || DEFAULT_SITE.materials;
  const items = materials.items || [];

  document.getElementById('materials-title').textContent = materials.title || 'მასალები';
  document.getElementById('materials-subtitle').textContent = materials.subtitle || '';

  if (!items.length) {
    materialsGrid.innerHTML = '<p class="page-empty">შინაარსი მალე დაემატება.</p>';
    return;
  }

  materialsGrid.innerHTML = items
    .map(
      (m) => `
      <article class="material-card">
        <img src="${encodeURI(m.image)}" alt="${escapeHtml(m.name)}" loading="lazy">
        <div class="material-card-body">
          <h3>${escapeHtml(m.name)}</h3>
          <p>${escapeHtml(m.description)}</p>
        </div>
      </article>
    `
    )
    .join('');
}

function renderAbout() {
  const about = siteData.about || DEFAULT_SITE.about;
  const paragraphs = about.paragraphs || [];
  const features = about.features || [];
  const hasContent = paragraphs.length || features.length || about.image;

  document.getElementById('about-title').textContent = about.title || 'ჩვენს შესახებ';

  const paragraphsEl = document.getElementById('about-paragraphs');
  const featuresEl = document.getElementById('about-features');
  const imageWrap = document.querySelector('.about-image');

  if (!hasContent) {
    paragraphsEl.innerHTML = '<p class="page-empty">შინაარსი მალე დაემატება.</p>';
    featuresEl.innerHTML = '';
    if (imageWrap) imageWrap.style.display = 'none';
    return;
  }

  if (imageWrap) imageWrap.style.display = '';
  paragraphsEl.innerHTML = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
  featuresEl.innerHTML = features.map((f) => `<li>${escapeHtml(f)}</li>`).join('');

  const img = document.getElementById('about-image');
  if (about.image) {
    img.src = about.image;
    img.alt = about.title || 'Craftwood';
    img.style.display = '';
  } else if (img) {
    img.style.display = 'none';
  }
}

function renderConsultation() {
  const c = siteData.consultation || DEFAULT_SITE.consultation;
  document.getElementById('consultation-title').textContent = c.title || DEFAULT_SITE.consultation.title;
  const descEl = document.getElementById('consultation-desc');
  if (c.description) {
    descEl.textContent = c.description;
    descEl.classList.remove('hidden');
  } else {
    descEl.textContent = '';
    descEl.classList.add('hidden');
  }
}

async function submitConsultationRequest(e) {
  e.preventDefault();
  if (!requestsApi) return;

  const phone = requestPhone.value.trim();
  const message = requestMessage.value.trim();
  const token = config.reviewWriteToken;
  const repo = config.repo;
  const branch = config.branch || 'main';

  if (!phone || !message) return;

  const submitBtn = document.getElementById('request-submit');
  submitBtn.disabled = true;
  consultationFormNote.textContent = 'იგზავნება...';
  consultationFormNote.className = 'consultation-form-note';

  try {
    if (token && repo) {
      await requestsApi.submitRequestToRepo(token, repo, branch, { phone, message });
    } else {
      requestsApi.saveLocalRequest({ phone, message });
    }

    consultationForm.reset();
    consultationFormNote.textContent = token
      ? 'გმადლობთ! მოთხოვნა მიღებულია, მალე დაგიკავშირდებით.'
      : 'გმადლობთ! მოთხოვნა შენახულია (ლოკალურად).';
    consultationFormNote.className = 'consultation-form-note is-success';
  } catch {
    consultationFormNote.textContent = 'გაგზავნა ვერ მოხერხდა. სცადეთ თავიდან.';
    consultationFormNote.className = 'consultation-form-note is-error';
  } finally {
    submitBtn.disabled = false;
  }
}

function renderSiteContent() {
  const brand = siteData.brand || DEFAULT_SITE.brand;
  document.getElementById('brand-name').textContent = brand.name || 'Craftwood';
  document.getElementById('mobile-title').textContent = brand.name || 'Craftwood';
  document.getElementById('footer-year').textContent = new Date().getFullYear();

  const featuredSec = siteData.sections?.featured || DEFAULT_SITE.sections.featured;
  document.getElementById('featured-title').textContent = featuredSec.title;
  document.getElementById('featured-subtitle').textContent = featuredSec.subtitle || '';

  const gallerySec = siteData.sections?.gallery || DEFAULT_SITE.sections.gallery;
  document.getElementById('gallery-title').textContent = gallerySec.title;
  document.getElementById('gallery-subtitle').textContent = gallerySec.subtitle || '';

  renderMaterials();
  renderAbout();
  renderConsultation();
  renderFeaturedGrid();
  renderFullGallery();
}

function setStarInput(value) {
  const rating = Math.max(1, Math.min(5, Number(value) || 5));
  reviewRating.value = String(rating);
  reviewStars.querySelectorAll('.star-btn').forEach((btn) => {
    btn.classList.toggle('is-active', Number(btn.dataset.value) <= rating);
  });
}

function openLightbox(index) {
  currentIndex = index;
  const item = lightboxItems[index];
  const comments = getItemComments(item);
  lightboxImg.src = encodeURI(item.src);
  lightboxImg.alt = item.title;
  lightboxCaption.textContent = item.title;
  lightboxReviews.innerHTML = `
    <h3 class="reviews-heading">შეფასებები (${comments.length})</h3>
    <div class="reviews-list">${renderCommentsList(comments)}</div>
  `;
  reviewForm.reset();
  setStarInput(5);
  reviewFormNote.textContent = '';
  reviewFormNote.className = 'review-form-note';
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
  currentIndex = (currentIndex - 1 + lightboxItems.length) % lightboxItems.length;
  openLightbox(currentIndex);
}

function showNext() {
  currentIndex = (currentIndex + 1) % lightboxItems.length;
  openLightbox(currentIndex);
}

async function submitComment(e) {
  e.preventDefault();
  const item = lightboxItems[currentIndex];
  if (!item || !reviewsApi) return;

  const author = reviewAuthor.value.trim();
  const text = reviewText.value.trim();
  const rating = Number(reviewRating.value);
  const token = config.reviewWriteToken;
  const repo = config.repo;
  const branch = config.branch || 'main';

  if (!author || !text || rating < 1 || rating > 5) return;

  const submitBtn = reviewForm.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  reviewFormNote.textContent = 'ინახება...';
  reviewFormNote.className = 'review-form-note';

  const review = { itemSrc: item.src, author, text, rating };

  try {
    if (token && repo) {
      await reviewsApi.submitReviewToRepo(token, repo, branch, review);
    } else {
      reviewsApi.saveLocalReview(review);
    }

    allReviews = await reviewsApi.loadAllReviews();
    renderFeaturedGrid();
    renderFullGallery();
    openLightbox(currentIndex);
    reviewForm.reset();
    setStarInput(5);
    reviewFormNote.textContent = token
      ? 'გმადლობთ! შეფასება შენახულია.'
      : 'გმადლობთ! შეფასება შენახულია (ლოკალურად).';
    reviewFormNote.className = 'review-form-note is-success';
  } catch {
    reviewFormNote.textContent = 'შენახვა ვერ მოხერხდა. სცადეთ თავიდან.';
    reviewFormNote.className = 'review-form-note is-error';
  } finally {
    submitBtn.disabled = false;
  }
}

function switchView(viewId) {
  currentView = viewId;
  document.querySelectorAll('.view').forEach((v) => {
    v.classList.toggle('view--active', v.dataset.view === viewId);
  });
  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.view === viewId);
  });
  closeSidebar();
}

function closeSidebar() {
  sidebar.classList.remove('is-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
  document.querySelector('.sidebar-overlay')?.remove();
}

function openSidebar() {
  sidebar.classList.add('is-open');
  menuToggle?.setAttribute('aria-expanded', 'true');
  if (!document.querySelector('.sidebar-overlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay is-visible';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);
  }
}

function initNavigation() {
  const valid = ['featured', 'materials', 'about', 'consultation', 'gallery'];
  const hash = location.hash.replace('#', '');
  const view = valid.includes(hash) ? hash : 'featured';
  if (!hash || !valid.includes(hash)) {
    history.replaceState(null, '', '#featured');
  }
  switchView(view);

  document.querySelectorAll('.sidebar-link').forEach((el) => {
    el.addEventListener('click', (e) => {
      const viewId = el.dataset.view;
      if (!viewId) return;
      e.preventDefault();
      history.pushState(null, '', `#${viewId}`);
      switchView(viewId);
    });
  });

  document.querySelector('.sidebar-brand')?.addEventListener('click', (e) => {
    e.preventDefault();
    history.pushState(null, '', '#featured');
    switchView('featured');
  });

  window.addEventListener('popstate', () => {
    const h = location.hash.replace('#', '') || 'featured';
    switchView(valid.includes(h) ? h : 'featured');
  });
}

async function loadSiteData() {
  try {
    const [siteRes, galleryRes, reviews] = await Promise.all([
      fetch(`data/site.json?t=${Date.now()}`, { cache: 'no-store' }),
      fetch(`data/gallery.json?t=${Date.now()}`, { cache: 'no-store' }),
      reviewsApi ? reviewsApi.loadAllReviews() : Promise.resolve([]),
    ]);

    siteData = siteRes.ok ? await siteRes.json() : DEFAULT_SITE;
    const galleryData = galleryRes.ok ? await galleryRes.json() : { items: [] };
    galleryItems = galleryData.items || [];
    allReviews = reviews;
    renderSiteContent();
  } catch {
    siteData = DEFAULT_SITE;
    galleryItems = [];
    renderSiteContent();
  }
}

reviewStars.querySelectorAll('.star-btn').forEach((btn) => {
  btn.addEventListener('click', () => setStarInput(btn.dataset.value));
});

reviewForm.addEventListener('submit', submitComment);
consultationForm?.addEventListener('submit', submitConsultationRequest);
lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
lightbox.querySelector('.lightbox-prev').addEventListener('click', showPrev);
lightbox.querySelector('.lightbox-next').addEventListener('click', showNext);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });

document.addEventListener('keydown', (e) => {
  if (!lightbox.classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') showPrev();
  if (e.key === 'ArrowRight') showNext();
});

menuToggle?.addEventListener('click', () => {
  sidebar.classList.contains('is-open') ? closeSidebar() : openSidebar();
});
sidebarClose?.addEventListener('click', closeSidebar);

initNavigation();
loadSiteData();
