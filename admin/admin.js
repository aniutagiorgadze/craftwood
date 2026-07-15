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
const itemsList = document.getElementById('items-list');
const statusEl = document.getElementById('status');
const uploadBtn = document.getElementById('upload-btn');

const config = window.CRAFTWOOD_CONFIG || { repo: '', branch: 'main' };
repoInput.value = sessionStorage.getItem(REPO_KEY) || config.repo || '';

let editingIndex = null;

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
  statusEl.className = `status ${type}`.trim();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function assetUrl(relativePath) {
  const base = window.location.href.replace(/\/admin\/.*$/, '/');
  return new URL(relativePath, base).href;
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
    throw new Error(msg);
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
    `/repos/${owner}/${repo}/contents/${path}?ref=${getBranch()}`
  );
  const content = JSON.parse(decodeBase64Utf8(data.content));
  return { content, sha: data.sha };
}

async function putFile(path, content, message, sha) {
  const [owner, repo] = getRepo().split('/');
  const body = {
    message,
    content: encodeUtf8Base64(content),
    branch: getBranch(),
  };
  if (sha) body.sha = sha;

  return githubFetch(`/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function putBinaryFile(path, base64Content, message) {
  const [owner, repo] = getRepo().split('/');
  return githubFetch(`/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: base64Content,
      branch: getBranch(),
    }),
  });
}

async function saveGallery(content, message) {
  const { sha } = await getFileContent('data/gallery.json');
  await putFile(
    'data/gallery.json',
    JSON.stringify(content, null, 2) + '\n',
    message,
    sha
  );
}

async function loadGalleryData() {
  const { content } = await getFileContent('data/gallery.json');
  return content;
}

function renderItems(items) {
  if (!items.length) {
    itemsList.innerHTML = '<p class="empty-list">ჯერ არაფერი არ არის ატვირთული.</p>';
    return;
  }

  itemsList.innerHTML = items
    .map((item, index) => {
      const isEditing = editingIndex === index;
      const imgSrc = assetUrl(item.src);

      if (isEditing) {
        return `
          <div class="item-row item-row--editing" data-index="${index}">
            <img src="${imgSrc}" alt="">
            <div class="item-edit-fields">
              <label>სათაური<input type="text" class="edit-title" value="${escapeHtml(item.title)}"></label>
              <label>კატეგორია<input type="text" class="edit-category" value="${escapeHtml(item.category)}"></label>
              <div class="item-actions">
                <button class="btn btn-primary save-btn" data-index="${index}">შენახვა</button>
                <button class="btn btn-ghost cancel-btn" data-index="${index}">გაუქმება</button>
              </div>
            </div>
          </div>
        `;
      }

      return `
        <div class="item-row" data-index="${index}">
          <img src="${imgSrc}" alt="${escapeHtml(item.title)}" onerror="this.classList.add('img-error')">
          <div class="item-info">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.category)}</p>
            <p class="item-path">${escapeHtml(item.src)}</p>
          </div>
          <div class="item-actions">
            <button class="btn btn-ghost edit-btn" data-index="${index}">რედაქტირება</button>
            <button class="btn btn-danger delete-btn" data-index="${index}">წაშლა</button>
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

function renderItemsFromCache() {
  renderItems(cachedItems);
}

async function refreshItems() {
  try {
    const data = await loadGalleryData();
    cachedItems = data.items || [];
    editingIndex = null;
    renderItems(cachedItems);
  } catch (err) {
    itemsList.innerHTML = `<p class="empty-list">${escapeHtml(err.message)}</p>`;
  }
}

async function showPanel() {
  const user = await githubFetch('/user');
  userName.textContent = user.login;
  loginSection.classList.add('hidden');
  panelSection.classList.remove('hidden');
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
  setStatus('');
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('image-input').files[0];
  const title = document.getElementById('title-input').value.trim();
  const category = document.getElementById('category-input').value.trim();

  if (!file) return;

  uploadBtn.disabled = true;
  setStatus('იტვირთება...', '');

  try {
    const ext = file.name.split('.').pop().toLowerCase();
    const filename = `${slugify()}.${ext}`;
    const imagePath = `images/uploads/${filename}`;
    const base64 = await fileToBase64(file);

    await putBinaryFile(imagePath, base64, `Add image: ${title}`);

    const { content } = await getFileContent('data/gallery.json');
    content.items.push({ src: imagePath, title, category });
    await saveGallery(content, `Add gallery item: ${title}`);

    uploadForm.reset();
    await refreshItems();
    setStatus('ფოტო წარმატებით აიტვირთა! საიტი განახლდება 1-2 წუთში.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    uploadBtn.disabled = false;
  }
});

async function saveItem(index) {
  const row = itemsList.querySelector(`.item-row[data-index="${index}"]`);
  const title = row.querySelector('.edit-title').value.trim();
  const category = row.querySelector('.edit-category').value.trim();

  if (!title || !category) {
    setStatus('სათაური და კატეგორია სავალდებულოა.', 'error');
    return;
  }

  setStatus('ინახება...', '');

  try {
    const { content } = await getFileContent('data/gallery.json');
    content.items[index] = { ...content.items[index], title, category };
    await saveGallery(content, `Update gallery item: ${title}`);
    editingIndex = null;
    await refreshItems();
    setStatus('შენახულია.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

async function deleteItem(index) {
  const item = cachedItems[index];
  if (!confirm(`ნამდვილად გსურთ წაშლა?\n${item.title}`)) return;

  setStatus('იშლება...', '');

  try {
    const { content } = await getFileContent('data/gallery.json');
    const [removed] = content.items.splice(index, 1);
    await saveGallery(content, `Remove gallery item: ${removed.title}`);
    editingIndex = null;
    await refreshItems();
    setStatus('წაიშალა.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  }
}

if (getToken()) {
  showPanel().catch(() => {
    sessionStorage.removeItem(STORAGE_KEY);
  });
}
