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

async function updateGallery(mutator, message) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { content, sha } = await getFileContent('data/gallery.json');
    const result = mutator(content);
    if (result === false) {
      throw new Error('ნამუშევერი ვერ მოიძებნა.');
    }
    try {
      await saveGallery(content, message, sha);
      return content;
    } catch (err) {
      const stale = err.message.includes('does not match') || err.message.includes('409');
      if (!stale || attempt === 2) throw err;
    }
  }
  throw new Error('gallery.json განახლება ვერ მოხერხდა. სცადეთ თავიდან.');
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
      const imgSrc = imagePreviewUrl(item.src);

      if (isEditing) {
        return `
          <div class="item-row item-row--editing" data-index="${index}">
            <img src="${imgSrc}" alt="" class="edit-preview">
            <div class="item-edit-fields">
              <label>სათაური<input type="text" class="edit-title" value="${escapeHtml(item.title)}"></label>
              <label>კატეგორია<input type="text" class="edit-category" value="${escapeHtml(item.category)}"></label>
              <label>ახალი სურათი (არასავალდებულო)<input type="file" class="edit-image" accept="image/*"></label>
              <div class="item-actions">
                <button type="button" class="btn btn-primary save-btn" data-index="${index}">შენახვა</button>
                <button type="button" class="btn btn-ghost cancel-btn" data-index="${index}">გაუქმება</button>
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
    if (editingIndex !== null && editingIndex >= cachedItems.length) {
      editingIndex = null;
    }
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

    const content = await updateGallery((gallery) => {
      gallery.items.push({ src: imagePath, title, category });
      return true;
    }, `Add gallery item: ${title}`);

    cachedItems = content.items;
    uploadForm.reset();
    editingIndex = null;
    renderItems(cachedItems);
    setStatus('ფოტო წარმატებით აიტვირთა! საიტი განახლდება 1-2 წუთში.', 'success');
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
  const category = row.querySelector('.edit-category').value.trim();
  const newFile = row.querySelector('.edit-image')?.files[0];

  if (!title || !category) {
    setStatus('სათაური და კატეგორია სავალდებულოა.', 'error');
    return;
  }

  setStatus('ინახება...', '');

  const targetSrc = cachedItems[index]?.src;
  if (!targetSrc) return;

  try {
    let newPath = null;
    let oldPath = null;

    if (newFile) {
      const ext = newFile.name.split('.').pop().toLowerCase();
      newPath = `images/uploads/${slugify()}.${ext}`;
      const base64 = await fileToBase64(newFile);
      await putBinaryFile(newPath, base64, `Replace image: ${title}`);
      oldPath = targetSrc;
    }

    const content = await updateGallery((gallery) => {
      const remoteIndex = gallery.items.findIndex((i) => i.src === targetSrc);
      if (remoteIndex === -1) return false;

      gallery.items[remoteIndex] = {
        ...gallery.items[remoteIndex],
        title,
        category,
        ...(newPath ? { src: newPath } : {}),
      };
      return true;
    }, `Update gallery item: ${title}`);

    if (oldPath && isUploadedImage(oldPath)) {
      await deleteRepoFile(oldPath, `Delete old image: ${title}`);
    }

    cachedItems = content.items;
    editingIndex = null;
    renderItems(cachedItems);
    setStatus('შენახულია! საიტი განახლდება 1-2 წუთში.', 'success');
  } catch (err) {
    await refreshItems();
    setStatus(err.message, 'error');
  }
}

async function deleteItem(index) {
  const item = cachedItems[index];
  if (!item) return;
  if (!confirm(`ნამდვილად გსურთ წაშლა?\n${item.title}`)) return;

  const targetSrc = item.src;
  const backup = [...cachedItems];

  cachedItems.splice(index, 1);
  if (editingIndex === index) editingIndex = null;
  else if (editingIndex !== null && editingIndex > index) editingIndex -= 1;
  renderItems(cachedItems);
  setStatus('იშლება...', '');

  try {
    let removed = null;

    const content = await updateGallery((gallery) => {
      const remoteIndex = gallery.items.findIndex((i) => i.src === targetSrc);
      if (remoteIndex === -1) return false;
      [removed] = gallery.items.splice(remoteIndex, 1);
      return true;
    }, `Remove gallery item: ${item.title}`);

    if (removed && isUploadedImage(removed.src)) {
      await deleteRepoFile(removed.src, `Delete image file: ${removed.title}`);
    }

    cachedItems = content.items;
    renderItems(cachedItems);
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
