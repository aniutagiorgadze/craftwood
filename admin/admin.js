const STORAGE_KEY = 'craftwood_admin_token';
const REPO_KEY = 'craftwood_admin_repo';

const loginSection = document.getElementById('login-section');
const panelSection = document.getElementById('panel-section');
const loginForm = document.getElementById('login-form');
const uploadForm = document.getElementById('upload-form');
const tokenInput = document.getElementById('token-input');
const repoInput = document.getElementById('repo-input');
const userName = document.getElementById('user-name');
const logoutBtn = document.getElementById('logout-btn');
const sidebarNav = document.getElementById('sidebar-nav');
const sidebarUser = document.getElementById('sidebar-user');
const sidebar = document.getElementById('sidebar');
const sidebarClose = document.getElementById('sidebar-close');
const menuToggle = document.getElementById('menu-toggle');
const mobileTitle = document.getElementById('mobile-title');
const sidebarBrand = document.getElementById('sidebar-brand');
const itemsList = document.getElementById('items-list');
const featuredList = document.getElementById('featured-list');
const materialsList = document.getElementById('materials-list');
const reviewsList = document.getElementById('reviews-list');
const statusEl = document.getElementById('status');
const uploadBtn = document.getElementById('upload-btn');
const confirmDialog = document.getElementById('confirm-dialog');
const confirmMessage = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');

const config = window.CRAFTWOOD_CONFIG || { repo: '', branch: 'main' };
repoInput.value = sessionStorage.getItem(REPO_KEY) || config.repo || '';

const GALLERY_CATEGORIES = [
  'სამზარეულო',
  'მისაღები ოთახი',
  'საძინებელი',
  'საბავშვო ოთახი',
  'კარადები და გარდერობები',
  'მაგიდები',
  'სკამები და დასაჯდომი ავეჯი',
  'სააბაზანოს ავეჯი',
  'დერეფნის ავეჯი',
  'ოფისის ავეჯი',
  'კომერციული ავეჯი',
  'კარები და კედლის პანელები',
  'თაროები და დეკორატიული ავეჯი',
  'სრული ინტერიერის პროექტები',
  'სხვა ...',
];

const OTHER_CATEGORY = 'სხვა ...';

const ADMIN_VIEWS = ['featured', 'materials', 'about', 'consultation', 'gallery', 'comments'];

const ADMIN_VIEW_TITLES = {
  featured: 'განსაკუთრებული ნამუშევრები',
  materials: 'მასალები',
  about: 'ჩვენს შესახებ',
  consultation: 'შეუკვეთე კონსულტაცია',
  gallery: 'სრული ნამუშევრები',
  comments: 'კომენტარები',
};

let editingIndex = null;
let editingReviewId = null;
let galleryQueue = Promise.resolve();
let siteQueue = Promise.resolve();

function enqueueGallery(task) {
  const next = galleryQueue.then(task, task);
  galleryQueue = next.catch(() => {});
  return next;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isGalleryConflict(err) {
  return (
    err?.status === 409 ||
    (err?.message && err.message.includes('does not match'))
  );
}

function getToken() {
  return sessionStorage.getItem(STORAGE_KEY);
}

function getRepo() {
  return sessionStorage.getItem(REPO_KEY) || config.repo;
}

function getBranch() {
  return config.branch || 'main';
}

function setStatus(message, type = '') {
  statusEl.textContent = message;
  statusEl.className = `status status-global ${type}`.trim();
  if (message && type === 'success') {
    statusEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function confirmDelete(item) {
  return new Promise((resolve) => {
    confirmMessage.textContent = `«${item.title}» — ეს ნამუშევარი სრულად წაიშლება.`;
    confirmDialog.classList.remove('hidden');
    confirmDialog.setAttribute('aria-hidden', 'false');

    const cleanup = (result) => {
      confirmDialog.classList.add('hidden');
      confirmDialog.setAttribute('aria-hidden', 'true');
      confirmOkBtn.removeEventListener('click', onOk);
      confirmCancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };

    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    confirmOkBtn.addEventListener('click', onOk);
    confirmCancelBtn.addEventListener('click', onCancel);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function isPresetCategory(value) {
  return GALLERY_CATEGORIES.includes(value);
}

function categorySelectHtml(selectedValue, selectClass, otherClass) {
  const preset = isPresetCategory(selectedValue) ? selectedValue : OTHER_CATEGORY;
  const customValue = isPresetCategory(selectedValue) ? '' : selectedValue || '';
  const options = GALLERY_CATEGORIES.map(
    (cat) =>
      `<option value="${escapeHtml(cat)}"${cat === preset ? ' selected' : ''}>${escapeHtml(cat)}</option>`
  ).join('');

  return `
    <select class="${selectClass}">${options}</select>
    <input type="text" class="${otherClass} category-other${preset === OTHER_CATEGORY ? '' : ' hidden'}" value="${escapeHtml(customValue)}" placeholder="ჩაწერეთ კატეგორია">
  `;
}

function fillCategorySelect(selectEl, selectedValue = '') {
  if (!selectEl) return;
  selectEl.innerHTML = GALLERY_CATEGORIES.map(
    (cat) =>
      `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
  ).join('');
  selectEl.value = isPresetCategory(selectedValue) ? selectedValue : OTHER_CATEGORY;
}

function syncCategoryOtherVisibility(selectEl, otherEl) {
  if (!selectEl || !otherEl) return;
  otherEl.classList.toggle('hidden', selectEl.value !== OTHER_CATEGORY);
  if (selectEl.value !== OTHER_CATEGORY) {
    otherEl.value = '';
  }
}

function bindCategorySelect(selectEl, otherEl) {
  if (!selectEl || !otherEl) return;
  syncCategoryOtherVisibility(selectEl, otherEl);
  selectEl.addEventListener('change', () => syncCategoryOtherVisibility(selectEl, otherEl));
}

function readCategoryValue(selectEl, otherEl) {
  if (!selectEl) return '';
  if (selectEl.value === OTHER_CATEGORY) {
    return otherEl?.value.trim() || '';
  }
  return selectEl.value;
}

function renderReviewStars(rating) {
  const value = Math.max(1, Math.min(5, Number(rating) || 5));
  return Array.from({ length: 5 }, (_, i) => {
    const cls = i < value ? 'review-star is-filled' : 'review-star';
    return `<span class="${cls}">★</span>`;
  }).join('');
}

function getItemTitleBySrc(src) {
  const item = cachedItems.find((entry) => entry.src === src);
  return item?.title || src;
}

function countVisibleReviews(itemSrc) {
  return cachedReviews.filter((review) => review.itemSrc === itemSrc && !review.hidden).length;
}

function renderReviewsModeration() {
  if (!reviewsList) return;

  if (!cachedReviews.length) {
    reviewsList.innerHTML = '<p class="empty-list">კომენტარები ჯერ არ არის.</p>';
    return;
  }

  const sorted = [...cachedReviews].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  reviewsList.innerHTML = sorted
    .map((review) => {
      const isEditing = editingReviewId === review.id;
      if (isEditing) {
        return `
        <div class="review-mod-row review-mod-row--editing" data-review-id="${escapeHtml(review.id)}">
          <div class="review-edit-form">
            <p class="review-mod-item">${escapeHtml(getItemTitleBySrc(review.itemSrc))}</p>
            <label>სახელი<input type="text" class="edit-review-author" value="${escapeHtml(review.author)}"></label>
            <label>შეფასება
              <select class="edit-review-rating">
                ${[5, 4, 3, 2, 1].map((n) => `<option value="${n}"${review.rating === n ? ' selected' : ''}>${n} ★</option>`).join('')}
              </select>
            </label>
            <label>კომენტარი<textarea class="edit-review-text" rows="2">${escapeHtml(review.text)}</textarea></label>
            <div class="review-mod-actions review-mod-actions--row">
              <button type="button" class="btn btn-primary btn-xs review-save-btn" data-id="${escapeHtml(review.id)}">შენახვა</button>
              <button type="button" class="btn btn-ghost btn-xs review-cancel-btn">გაუქმება</button>
            </div>
          </div>
        </div>`;
      }

      return `
      <div class="review-mod-row${review.hidden ? ' review-mod-row--hidden' : ''}" data-review-id="${escapeHtml(review.id)}">
        <div class="review-mod-main">
          <p class="review-mod-item">${escapeHtml(getItemTitleBySrc(review.itemSrc))}</p>
          <div class="review-mod-head">
            <strong>${escapeHtml(review.author)}</strong>
            <span class="review-edit-stars">${renderReviewStars(review.rating)}</span>
            ${review.hidden ? '<span class="review-mod-badge">დამალული</span>' : ''}
          </div>
          <p class="review-mod-text">${escapeHtml(review.text)}</p>
          ${review.date ? `<time class="review-mod-date">${escapeHtml(review.date)}</time>` : ''}
        </div>
        <div class="review-mod-actions">
          <button type="button" class="btn btn-ghost btn-xs review-edit-btn" data-id="${escapeHtml(review.id)}">ჩასწორება</button>
          <button type="button" class="btn btn-ghost btn-xs review-hide-btn" data-id="${escapeHtml(review.id)}" data-hidden="${review.hidden ? '0' : '1'}">
            ${review.hidden ? 'გამოჩენა' : 'დამალვა'}
          </button>
          <button type="button" class="btn btn-danger btn-xs review-delete-btn" data-id="${escapeHtml(review.id)}">წაშლა</button>
        </div>
      </div>`;
    })
    .join('');

  reviewsList.querySelectorAll('.review-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingReviewId = btn.dataset.id;
      renderReviewsModeration();
    });
  });

  reviewsList.querySelectorAll('.review-cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingReviewId = null;
      renderReviewsModeration();
    });
  });

  reviewsList.querySelectorAll('.review-save-btn').forEach((btn) => {
    btn.addEventListener('click', () => saveReviewEdit(btn.dataset.id));
  });

  reviewsList.querySelectorAll('.review-hide-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleReviewHidden(btn.dataset.id, btn.dataset.hidden === '1'));
  });

  reviewsList.querySelectorAll('.review-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteReview(btn.dataset.id));
  });
}

async function saveReviewEdit(reviewId) {
  const row = reviewsList.querySelector(`[data-review-id="${reviewId}"]`);
  if (!row) return;

  const author = row.querySelector('.edit-review-author')?.value.trim() || '';
  const text = row.querySelector('.edit-review-text')?.value.trim() || '';
  const rating = row.querySelector('.edit-review-rating')?.value || '5';

  if (!author || !text) {
    setStatus('სახელი და კომენტარი საჭიროა.', 'error');
    return;
  }

  const reviewsApi = window.CraftwoodReviews;
  if (!reviewsApi) return;

  setStatus('ინახება...', '');
  try {
    const content = await reviewsApi.updateReviewFromRepo(
      getToken(),
      getRepo(),
      getBranch(),
      reviewId,
      { author, text, rating }
    );
    cachedReviews = content.reviews.map(reviewsApi.normalizeReview);
    editingReviewId = null;
    renderReviewsModeration();
    renderItemsFromCache();
    setStatus('კომენტარი განახლდა.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

async function refreshReviews() {
  const reviewsApi = window.CraftwoodReviews;
  if (!reviewsApi) {
    cachedReviews = [];
    renderReviewsModeration();
    return;
  }

  try {
    cachedReviews = await reviewsApi.loadPublicReviews();
    renderReviewsModeration();
  } catch (err) {
    reviewsList.innerHTML = `<p class="empty-list">${escapeHtml(err.message)}</p>`;
  }
}

async function toggleReviewHidden(reviewId, hide) {
  const reviewsApi = window.CraftwoodReviews;
  if (!reviewsApi) return;

  setStatus(hide ? 'იმალება...' : 'იხსნება...', '');

  try {
    const content = await reviewsApi.setReviewHidden(
      getToken(),
      getRepo(),
      getBranch(),
      reviewId,
      hide
    );
    cachedReviews = content.reviews.map(reviewsApi.normalizeReview);
    renderReviewsModeration();
    renderItemsFromCache();
    setStatus(hide ? 'შეფასება დამალულია.' : 'შეფასება გამოჩნდა.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
    await refreshReviews();
  }
}

async function deleteReview(reviewId) {
  const review = cachedReviews.find((entry) => entry.id === reviewId);
  if (!review) return;

  confirmMessage.textContent = `«${review.author}» — ეს შეფასება სრულად წაიშლება.`;
  confirmDialog.classList.remove('hidden');
  confirmDialog.setAttribute('aria-hidden', 'false');

  const confirmed = await new Promise((resolve) => {
    const cleanup = (result) => {
      confirmDialog.classList.add('hidden');
      confirmDialog.setAttribute('aria-hidden', 'true');
      confirmOkBtn.removeEventListener('click', onOk);
      confirmCancelBtn.removeEventListener('click', onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    confirmOkBtn.addEventListener('click', onOk);
    confirmCancelBtn.addEventListener('click', onCancel);
  });

  if (!confirmed) return;

  const reviewsApi = window.CraftwoodReviews;
  if (!reviewsApi) return;

  setStatus('იშლება...', '');

  try {
    const content = await reviewsApi.deleteReviewFromRepo(
      getToken(),
      getRepo(),
      getBranch(),
      reviewId
    );
    cachedReviews = content.reviews.map(reviewsApi.normalizeReview);
    renderReviewsModeration();
    renderItemsFromCache();
    setStatus('შეფასება წაიშალა.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
    await refreshReviews();
  }
}

function initUploadCategorySelect() {
  const selectEl = document.getElementById('category-input');
  const otherEl = document.getElementById('category-other-input');
  fillCategorySelect(selectEl);
  bindCategorySelect(selectEl, otherEl);
  const featuredCb = document.getElementById('upload-featured');
  if (featuredCb) featuredCb.checked = true;
}

function assetUrl(relativePath) {
  if (
    (location.hostname === 'localhost' || location.hostname === '127.0.0.1') &&
    config.siteUrl
  ) {
    return `${config.siteUrl.replace(/\/$/, '')}/${relativePath}`;
  }
  const base = window.location.href.replace(/\/admin\/.*$/, '/');
  return new URL(relativePath, base).href;
}

function encodeRepoPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function encodeAssetPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function imagePreviewUrl(path) {
  return `${assetUrl(encodeAssetPath(path))}?t=${Date.now()}`;
}

function isUploadedImage(path) {
  return path && path.startsWith('images/uploads/');
}

function encodeUtf8Base64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function decodeBase64Utf8(b64) {
  const binary = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes);
}

async function githubFetch(path, options = {}) {
  const token = getToken();
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data.message || 'GitHub API შეცდომა';
    if (msg.includes('Resource not accessible')) {
      throw new Error(
        'ტოკენს არ აქვს საჭირო უფლება. შექმენით Classic ტოკენი (repo) აქ: github.com/settings/tokens/new'
      );
    }
    const err = new Error(msg);
    err.status = response.status;
    throw err;
  }
  return data;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function slugify() {
  return `photo-${Date.now()}`;
}

async function getFileContent(path) {
  const [owner, repo] = getRepo().split('/');
  const data = await githubFetch(
    `/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${getBranch()}`
  );
  const content = JSON.parse(decodeBase64Utf8(data.content));
  return { content, sha: data.sha };
}

async function getRepoFileSha(path) {
  try {
    const [owner, repo] = getRepo().split('/');
    const data = await githubFetch(
      `/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}?ref=${getBranch()}`
    );
    return data.sha;
  } catch {
    return null;
  }
}

async function putFile(path, content, message, sha) {
  const [owner, repo] = getRepo().split('/');
  const body = {
    message,
    content: encodeUtf8Base64(content),
    branch: getBranch(),
  };
  if (sha) body.sha = sha;

  return githubFetch(`/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function putBinaryFile(path, base64Content, message) {
  const [owner, repo] = getRepo().split('/');
  return githubFetch(`/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: base64Content,
      branch: getBranch(),
    }),
  });
}

async function deleteRepoFile(path, message) {
  const sha = await getRepoFileSha(path);
  if (!sha) return;

  const [owner, repo] = getRepo().split('/');
  await githubFetch(`/repos/${owner}/${repo}/contents/${encodeRepoPath(path)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: getBranch() }),
  });
}

async function saveGallery(content, message, fileSha) {
  await putFile(
    'data/gallery.json',
    JSON.stringify(content, null, 2) + '\n',
    message,
    fileSha
  );
}

async function commitGalleryUpdate(mutator, message) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { content, sha } = await getFileContent('data/gallery.json');
    const result = mutator(content);
    if (result === false) {
      throw new Error('ნამუშევერი ვერ მოიძებნა.');
    }
    try {
      await saveGallery(content, message, sha);
      return content;
    } catch (err) {
      if (!isGalleryConflict(err) || attempt === 4) throw err;
      await sleep(350 * (attempt + 1));
    }
  }
  throw new Error('gallery.json განახლება ვერ მოხერხდა. სცადეთ თავიდან.');
}

async function updateGallery(mutator, message) {
  return enqueueGallery(() => commitGalleryUpdate(mutator, message));
}

function enqueueSite(task) {
  const next = siteQueue.then(task, task);
  siteQueue = next.catch(() => {});
  return next;
}

function closeSidebar() {
  sidebar?.classList.remove('is-open');
  menuToggle?.setAttribute('aria-expanded', 'false');
  document.querySelector('.sidebar-overlay')?.remove();
}

function openSidebar() {
  sidebar?.classList.add('is-open');
  menuToggle?.setAttribute('aria-expanded', 'true');
  if (!document.querySelector('.sidebar-overlay')) {
    const overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay is-visible';
    overlay.addEventListener('click', closeSidebar);
    document.body.appendChild(overlay);
  }
}

function switchAdminView(tabId) {
  const view = ADMIN_VIEWS.includes(tabId) ? tabId : 'featured';

  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.tab === view);
  });
  document.querySelectorAll('.admin-view').forEach((panel) => {
    panel.classList.toggle('is-active', panel.dataset.tab === view);
  });

  if (mobileTitle) {
    mobileTitle.textContent = ADMIN_VIEW_TITLES[view] || 'Craftwood ადმინი';
  }

  closeSidebar();
}

let navInitialized = false;

function initAdminNav() {
  const hash = location.hash.replace('#', '');
  const view = ADMIN_VIEWS.includes(hash) ? hash : 'featured';
  if (panelSection && !panelSection.classList.contains('hidden') && (!hash || !ADMIN_VIEWS.includes(hash))) {
    history.replaceState(null, '', `#${view}`);
  }
  switchAdminView(view);

  if (navInitialized) return;
  navInitialized = true;

  document.querySelectorAll('.sidebar-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      const tabId = link.dataset.tab;
      if (!tabId) return;
      e.preventDefault();
      history.pushState(null, '', `#${tabId}`);
      switchAdminView(tabId);
    });
  });

  sidebarBrand?.addEventListener('click', (e) => {
    if (panelSection?.classList.contains('hidden')) return;
    e.preventDefault();
    history.pushState(null, '', '#featured');
    switchAdminView('featured');
  });

  window.addEventListener('popstate', () => {
    if (panelSection?.classList.contains('hidden')) return;
    const h = location.hash.replace('#', '') || 'featured';
    switchAdminView(ADMIN_VIEWS.includes(h) ? h : 'featured');
  });
}

function setLoggedInUi(isLoggedIn) {
  sidebarNav?.classList.toggle('hidden', !isLoggedIn);
  sidebarUser?.classList.toggle('hidden', !isLoggedIn);
  logoutBtn?.classList.toggle('hidden', !isLoggedIn);
}

function initAdminTabs() {
  initAdminNav();
}

async function loadGalleryData() {
  const { content } = await getFileContent('data/gallery.json');
  return content;
}

async function loadSiteData() {
  try {
    const { content } = await getFileContent('data/site.json');
    return content;
  } catch (err) {
    if (err.status === 404) {
      return {
        brand: { name: 'Craftwood' },
        sections: { featured: { title: '', subtitle: '' }, gallery: { title: '', subtitle: '' } },
        about: { title: '', paragraphs: [], features: [], image: 'images/placeholder-1.svg' },
        consultation: { title: '', description: '', phone: '', email: '', buttonText: '' },
        materials: { title: '', subtitle: '', items: [] },
      };
    }
    throw err;
  }
}

async function commitSiteUpdate(mutator, message) {
  for (let attempt = 0; attempt < 5; attempt++) {
    let content;
    let sha;
    try {
      ({ content, sha } = await getFileContent('data/site.json'));
    } catch (err) {
      if (err.status === 404) {
        content = await loadSiteData();
        sha = null;
      } else throw err;
    }
    mutator(content);
    try {
      await putFile('data/site.json', JSON.stringify(content, null, 2) + '\n', message, sha);
      return content;
    } catch (err) {
      if (!isGalleryConflict(err) || attempt === 4) throw err;
      await sleep(350 * (attempt + 1));
    }
  }
  throw new Error('site.json განახლება ვერ მოხერხდა.');
}

function populateSiteForms() {
  const s = cachedSite;
  document.getElementById('featured-section-title').value = s.sections?.featured?.title || '';
  document.getElementById('featured-section-subtitle').value = s.sections?.featured?.subtitle || '';
  document.getElementById('gallery-section-title').value = s.sections?.gallery?.title || '';
  document.getElementById('gallery-section-subtitle').value = s.sections?.gallery?.subtitle || '';
  document.getElementById('materials-title').value = s.materials?.title || '';
  document.getElementById('materials-subtitle').value = s.materials?.subtitle || '';
  document.getElementById('about-title').value = s.about?.title || '';
  document.getElementById('about-p1').value = s.about?.paragraphs?.[0] || '';
  document.getElementById('about-p2').value = s.about?.paragraphs?.[1] || '';
  document.getElementById('about-f1').value = s.about?.features?.[0] || '';
  document.getElementById('about-f2').value = s.about?.features?.[1] || '';
  document.getElementById('about-f3').value = s.about?.features?.[2] || '';
  document.getElementById('about-image-current').textContent = s.about?.image
    ? `მიმდინარე: ${s.about.image}`
    : '';
  document.getElementById('consultation-title').value = s.consultation?.title || '';
  document.getElementById('consultation-desc').value = s.consultation?.description || '';
  document.getElementById('consultation-phone').value = s.consultation?.phone || '';
  document.getElementById('consultation-email').value = s.consultation?.email || '';
  document.getElementById('consultation-button').value = s.consultation?.buttonText || '';
}

function renderFeaturedList() {
  if (!featuredList) return;
  if (!cachedItems.length) {
    featuredList.innerHTML = '<p class="empty-list">ჯერ ნამუშევრები არ არის.</p>';
    return;
  }

  featuredList.innerHTML = cachedItems
    .map(
      (item, index) => `
      <label class="featured-row">
        <input type="checkbox" class="featured-toggle" data-index="${index}"${item.featured ? ' checked' : ''}>
        <img src="${imagePreviewUrl(item.src)}" alt="" class="featured-thumb">
        <span>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.category)}</small>
        </span>
      </label>
    `
    )
    .join('');

  featuredList.querySelectorAll('.featured-toggle').forEach((cb) => {
    cb.addEventListener('change', () => toggleFeatured(Number(cb.dataset.index), cb.checked));
  });
}

async function toggleFeatured(index, featured) {
  const targetSrc = cachedItems[index]?.src;
  if (!targetSrc) return;

  setStatus('ინახება...', '');
  try {
    const content = await updateGallery((data) => {
      const i = data.items.findIndex((item) => item.src === targetSrc);
      if (i === -1) return false;
      if (featured) data.items[i].featured = true;
      else delete data.items[i].featured;
      return true;
    }, `Toggle featured: ${cachedItems[index].title}`);
    cachedItems = content.items;
    renderFeaturedList();
    renderItems(cachedItems);
    setStatus(featured ? 'დაემატა განსაკუთრებულებში.' : 'ამოიღო განსაკუთრებულებიდან.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
    renderFeaturedList();
  }
}

function renderMaterialsList() {
  if (!materialsList) return;
  const items = cachedSite.materials?.items || [];
  if (!items.length) {
    materialsList.innerHTML = '<p class="empty-list">მასალები ჯერ არ არის.</p>';
    return;
  }

  materialsList.innerHTML = items
    .map(
      (m) => `
      <div class="item-row" data-material-id="${escapeHtml(m.id)}">
        <img src="${imagePreviewUrl(m.image)}" alt="">
        <div class="item-info">
          <h3>${escapeHtml(m.name)}</h3>
          <p>${escapeHtml(m.description)}</p>
        </div>
        <div class="item-actions">
          <button type="button" class="btn btn-danger btn-xs material-delete-btn" data-id="${escapeHtml(m.id)}">წაშლა</button>
        </div>
      </div>
    `
    )
    .join('');

  materialsList.querySelectorAll('.material-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteMaterial(btn.dataset.id));
  });
}

async function deleteMaterial(materialId) {
  const mat = cachedSite.materials?.items?.find((m) => m.id === materialId);
  if (!mat) return;
  confirmMessage.textContent = `«${mat.name}» — წაიშლება.`;
  confirmDialog.classList.remove('hidden');
  confirmDialog.setAttribute('aria-hidden', 'false');
  const confirmed = await new Promise((resolve) => {
    const cleanup = (r) => {
      confirmDialog.classList.add('hidden');
      confirmDialog.setAttribute('aria-hidden', 'true');
      confirmOkBtn.removeEventListener('click', onOk);
      confirmCancelBtn.removeEventListener('click', onCancel);
      resolve(r);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    confirmOkBtn.addEventListener('click', onOk);
    confirmCancelBtn.addEventListener('click', onCancel);
  });
  if (!confirmed) return;

  setStatus('იშლება...', '');
  try {
    cachedSite = await enqueueSite(() =>
      commitSiteUpdate((site) => {
        site.materials.items = site.materials.items.filter((m) => m.id !== materialId);
        return true;
      }, `Delete material ${mat.name}`)
    );
    if (isUploadedImage(mat.image)) {
      await deleteRepoFile(mat.image, `Delete material image: ${mat.name}`);
    }
    renderMaterialsList();
    setStatus('მასალა წაიშალა.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

function renderItems(items) {
  if (!items.length) {
    itemsList.innerHTML = '<p class="empty-list">ჯერ არაფერი არ არის ატვირთული.</p>';
    return;
  }

  itemsList.innerHTML = items
    .map((item, index) => {
      const isEditing = editingIndex === index;
      const imgSrc = imagePreviewUrl(item.src);

      if (isEditing) {
        return `
          <div class="item-row item-row--editing" data-index="${index}">
            <img src="${imgSrc}" alt="" class="edit-preview">
            <div class="item-edit-fields">
              <label>სათაური<input type="text" class="edit-title" value="${escapeHtml(item.title)}"></label>
              <label>კატეგორია${categorySelectHtml(item.category, 'edit-category', 'edit-category-other')}</label>
              <label>ახალი სურათი (არასავალდებულო)<input type="file" class="edit-image" accept="image/*"></label>
              <div class="item-actions">
                <button type="button" class="btn btn-primary save-btn" data-index="${index}">შენახვა</button>
                <button type="button" class="btn btn-ghost cancel-btn" data-index="${index}">გაუქმება</button>
              </div>
            </div>
          </div>
        `;
      }

      const reviewCount = countVisibleReviews(item.src);

      return `
        <div class="item-row" data-index="${index}">
          <img src="${imgSrc}" alt="${escapeHtml(item.title)}" onerror="this.classList.add('img-error')">
          <div class="item-info">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.category)}</p>
            ${reviewCount ? `<p class="item-reviews-count">${reviewCount} კომენტარი</p>` : ''}
            <p class="item-path">${escapeHtml(item.src)}</p>
          </div>
          <div class="item-actions">
            <button type="button" class="btn btn-ghost edit-btn" data-index="${index}">რედაქტირება</button>
            <button type="button" class="btn btn-danger delete-btn" data-index="${index}">წაშლა</button>
          </div>
        </div>
      `;
    })
    .join('');

  itemsList.querySelectorAll('.edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingIndex = Number(btn.dataset.index);
      renderItemsFromCache();
    });
  });

  itemsList.querySelectorAll('.item-row--editing .edit-category').forEach((selectEl) => {
    const row = selectEl.closest('.item-row');
    const otherEl = row?.querySelector('.edit-category-other');
    bindCategorySelect(selectEl, otherEl);
  });

  itemsList.querySelectorAll('.cancel-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingIndex = null;
      renderItemsFromCache();
    });
  });

  itemsList.querySelectorAll('.save-btn').forEach((btn) => {
    btn.addEventListener('click', () => saveItem(Number(btn.dataset.index)));
  });

  itemsList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteItem(Number(btn.dataset.index)));
  });
}

let cachedItems = [];
let cachedReviews = [];
let cachedSite = {};

function renderItemsFromCache() {
  renderItems(cachedItems);
}

async function refreshItems() {
  try {
    const [galleryData, siteData] = await Promise.all([loadGalleryData(), loadSiteData()]);
    cachedItems = galleryData.items || [];
    cachedSite = siteData;
    if (editingIndex !== null && editingIndex >= cachedItems.length) {
      editingIndex = null;
    }
    populateSiteForms();
    renderItems(cachedItems);
    renderFeaturedList();
    renderMaterialsList();
    await refreshReviews();
  } catch (err) {
    if (itemsList) itemsList.innerHTML = `<p class="empty-list">${escapeHtml(err.message)}</p>`;
  }
}

async function showPanel() {
  const user = await githubFetch('/user');
  userName.textContent = user.login;
  loginSection.classList.add('hidden');
  panelSection.classList.remove('hidden');
  setLoggedInUi(true);
  initUploadCategorySelect();
  initAdminNav();
  await refreshItems();
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = tokenInput.value.trim();
  const repo = repoInput.value.trim();

  if (!repo.includes('/')) {
    setStatus('რეპოზიტორია უნდა იყოს ფორმატით: username/craftwood', 'error');
    return;
  }

  sessionStorage.setItem(STORAGE_KEY, token);
  sessionStorage.setItem(REPO_KEY, repo);

  try {
    await showPanel();
    setStatus('');
    tokenInput.value = '';
  } catch (err) {
    sessionStorage.removeItem(STORAGE_KEY);
    setStatus(err.message, 'error');
  }
});

logoutBtn.addEventListener('click', () => {
  sessionStorage.removeItem(STORAGE_KEY);
  panelSection.classList.add('hidden');
  loginSection.classList.remove('hidden');
  setLoggedInUi(false);
  setStatus('');
  closeSidebar();
  if (mobileTitle) mobileTitle.textContent = 'Craftwood ადმინი';
  history.replaceState(null, '', location.pathname);
});

menuToggle?.addEventListener('click', () => {
  sidebar?.classList.contains('is-open') ? closeSidebar() : openSidebar();
});
sidebarClose?.addEventListener('click', closeSidebar);

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('image-input').files[0];
  const title = document.getElementById('title-input').value.trim();
  const category = readCategoryValue(
    document.getElementById('category-input'),
    document.getElementById('category-other-input')
  );

  if (!file) return;

  if (!title || !category) {
    setStatus('სათაური და კატეგორია სავალდებულოა.', 'error');
    return;
  }

  uploadBtn.disabled = true;
  setStatus('იტვირთება...', '');

  try {
    const content = await enqueueGallery(async () => {
      const ext = file.name.split('.').pop().toLowerCase();
      const filename = `${slugify()}.${ext}`;
      const imagePath = `images/uploads/${filename}`;
      const base64 = await fileToBase64(file);

      await putBinaryFile(imagePath, base64, `Add image: ${title}`);

      return commitGalleryUpdate((gallery) => {
        const item = { src: imagePath, title, category };
        const featuredCb = document.getElementById('upload-featured');
        if (featuredCb?.checked ?? true) item.featured = true;
        gallery.items.push(item);
        return true;
      }, `Add gallery item: ${title}`);
    });

    cachedItems = content.items;
    uploadForm.reset();
    initUploadCategorySelect();
    editingIndex = null;
    renderItems(cachedItems);
    renderFeaturedList();
    setStatus('ფოტო წარმატებით აიტვირთა!', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    uploadBtn.disabled = false;
  }
});

async function saveItem(index) {
  const row = itemsList.querySelector(`.item-row[data-index="${index}"]`);
  if (!row) return;

  const title = row.querySelector('.edit-title').value.trim();
  const category = readCategoryValue(
    row.querySelector('.edit-category'),
    row.querySelector('.edit-category-other')
  );
  const newFile = row.querySelector('.edit-image')?.files[0];

  if (!title || !category) {
    setStatus('სათაური და კატეგორია სავალდებულოა.', 'error');
    return;
  }

  setStatus('ინახება...', '');

  const targetSrc = cachedItems[index]?.src;
  if (!targetSrc) return;

  const saveBtn = row.querySelector('.save-btn');
  if (saveBtn) saveBtn.disabled = true;

  try {
    let replacedPath = null;

    const content = await enqueueGallery(async () => {
      let newPath = null;
      let oldPath = null;

      if (newFile) {
        const ext = newFile.name.split('.').pop().toLowerCase();
        newPath = `images/uploads/${slugify()}.${ext}`;
        const base64 = await fileToBase64(newFile);
        await putBinaryFile(newPath, base64, `Replace image: ${title}`);
        oldPath = targetSrc;
        replacedPath = newPath;
      }

      const gallery = await commitGalleryUpdate((items) => {
        const remoteIndex = items.items.findIndex((i) => i.src === targetSrc);
        if (remoteIndex === -1) return false;

        items.items[remoteIndex] = {
          ...items.items[remoteIndex],
          title,
          category,
          ...(newPath ? { src: newPath } : {}),
        };
        return true;
      }, `Update gallery item: ${title}`);

      if (oldPath && isUploadedImage(oldPath)) {
        await deleteRepoFile(oldPath, `Delete old image: ${title}`);
      }

      return gallery;
    });

    if (replacedPath && window.CraftwoodReviews) {
      await window.CraftwoodReviews.updateReviewsItemSrc(
        getToken(),
        getRepo(),
        getBranch(),
        targetSrc,
        replacedPath
      );
    }

    cachedItems = content.items;
    editingIndex = null;
    renderItems(cachedItems);
    renderFeaturedList();
    await refreshReviews();
    setStatus('წარმატებით შეინახა ცვლილება', 'success');
  } catch (err) {
    await refreshItems();
    setStatus(err.message, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function deleteItem(index) {
  const item = cachedItems[index];
  if (!item) return;

  const confirmed = await confirmDelete(item);
  if (!confirmed) return;

  const targetSrc = item.src;
  const backup = [...cachedItems];

  cachedItems.splice(index, 1);
  if (editingIndex === index) editingIndex = null;
  else if (editingIndex !== null && editingIndex > index) editingIndex -= 1;
  renderItems(cachedItems);
  setStatus('იშლება...', '');

  try {
    const content = await enqueueGallery(async () => {
      let removed = null;

      const gallery = await commitGalleryUpdate((items) => {
        const remoteIndex = items.items.findIndex((i) => i.src === targetSrc);
        if (remoteIndex === -1) return false;
        [removed] = items.items.splice(remoteIndex, 1);
        return true;
      }, `Remove gallery item: ${item.title}`);

      if (removed && isUploadedImage(removed.src)) {
        await deleteRepoFile(removed.src, `Delete image file: ${removed.title}`);
      }

      return gallery;
    });

    if (window.CraftwoodReviews) {
      await window.CraftwoodReviews.deleteReviewsForItem(
        getToken(),
        getRepo(),
        getBranch(),
        targetSrc
      );
    }

    cachedItems = content.items;
    renderItems(cachedItems);
    renderFeaturedList();
    await refreshReviews();
    setStatus('წაიშალა!', 'success');
  } catch (err) {
    cachedItems = backup;
    renderItems(cachedItems);
    setStatus(err.message, 'error');
  }
}

if (getToken()) {
  showPanel().catch(() => {
    sessionStorage.removeItem(STORAGE_KEY);
  });
}

document.getElementById('save-featured-section')?.addEventListener('click', async () => {
  setStatus('ინახება...', '');
  try {
    cachedSite = await enqueueSite(() =>
      commitSiteUpdate((site) => {
        site.sections = site.sections || {};
        site.sections.featured = {
          title: document.getElementById('featured-section-title').value.trim(),
          subtitle: document.getElementById('featured-section-subtitle').value.trim(),
        };
      }, 'Update featured section')
    );
    setStatus('განსაკუთრებული სექცია შენახულია.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

document.getElementById('save-gallery-section')?.addEventListener('click', async () => {
  setStatus('ინახება...', '');
  try {
    cachedSite = await enqueueSite(() =>
      commitSiteUpdate((site) => {
        site.sections = site.sections || {};
        site.sections.gallery = {
          title: document.getElementById('gallery-section-title').value.trim(),
          subtitle: document.getElementById('gallery-section-subtitle').value.trim(),
        };
      }, 'Update gallery section')
    );
    setStatus('გალერეის სექცია შენახულია.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

document.getElementById('save-materials-header')?.addEventListener('click', async () => {
  setStatus('ინახება...', '');
  try {
    cachedSite = await enqueueSite(() =>
      commitSiteUpdate((site) => {
        site.materials = site.materials || { items: [] };
        site.materials.title = document.getElementById('materials-title').value.trim();
        site.materials.subtitle = document.getElementById('materials-subtitle').value.trim();
      }, 'Update materials header')
    );
    setStatus('მასალების სათაური შენახულია.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

document.getElementById('material-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('material-name').value.trim();
  const description = document.getElementById('material-desc').value.trim();
  const file = document.getElementById('material-image').files[0];
  if (!name || !description || !file) return;

  setStatus('იტვირთება...', '');
  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const imagePath = `images/uploads/mat-${Date.now()}.${ext}`;
    const base64 = await fileToBase64(file);
    await putBinaryFile(imagePath, base64, `Add material: ${name}`);

    cachedSite = await enqueueSite(() =>
      commitSiteUpdate((site) => {
        site.materials = site.materials || { title: 'მასალები', subtitle: '', items: [] };
        if (!Array.isArray(site.materials.items)) site.materials.items = [];
        site.materials.items.push({
          id: `mat-${Date.now()}`,
          name,
          description,
          image: imagePath,
        });
      }, `Add material: ${name}`)
    );
    e.target.reset();
    renderMaterialsList();
    setStatus('მასალა დაემატა.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

document.getElementById('about-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('ინახება...', '');
  try {
    let imagePath = cachedSite.about?.image || 'images/placeholder-1.svg';
    const imageFile = document.getElementById('about-image').files[0];
    if (imageFile) {
      const ext = imageFile.name.split('.').pop().toLowerCase();
      imagePath = `images/uploads/about-${Date.now()}.${ext}`;
      const base64 = await fileToBase64(imageFile);
      await putBinaryFile(imagePath, base64, 'Update about image');
    }

    cachedSite = await enqueueSite(() =>
      commitSiteUpdate((site) => {
        site.about = {
          title: document.getElementById('about-title').value.trim(),
          paragraphs: [
            document.getElementById('about-p1').value.trim(),
            document.getElementById('about-p2').value.trim(),
          ].filter(Boolean),
          features: [
            document.getElementById('about-f1').value.trim(),
            document.getElementById('about-f2').value.trim(),
            document.getElementById('about-f3').value.trim(),
          ].filter(Boolean),
          image: imagePath,
        };
      }, 'Update about section')
    );
    populateSiteForms();
    setStatus('ჩვენს შესახებ შენახულია.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
});

document.getElementById('consultation-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setStatus('ინახება...', '');
  try {
    cachedSite = await enqueueSite(() =>
      commitSiteUpdate((site) => {
        site.consultation = {
          title: document.getElementById('consultation-title').value.trim(),
          description: document.getElementById('consultation-desc').value.trim(),
          phone: document.getElementById('consultation-phone').value.trim(),
          email: document.getElementById('consultation-email').value.trim(),
          buttonText: document.getElementById('consultation-button').value.trim(),
        };
      }, 'Update consultation section')
    );
    setStatus('კონსულტაციის სექცია შენახულია.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
});
