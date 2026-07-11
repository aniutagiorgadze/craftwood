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
    throw new Error(data.message || 'GitHub API შეცდომა');
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

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u10A0-\u10FF]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'image';
}

async function getFileContent(path) {
  const [owner, repo] = getRepo().split('/');
  const data = await githubFetch(
    `/repos/${owner}/${repo}/contents/${path}?ref=${getBranch()}`
  );
  const content = JSON.parse(atob(data.content.replace(/\n/g, '')));
  return { content, sha: data.sha };
}

async function putFile(path, content, message, sha) {
  const [owner, repo] = getRepo().split('/');
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
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

async function deleteFile(path, sha, message) {
  const [owner, repo] = getRepo().split('/');
  return githubFetch(`/repos/${owner}/${repo}/contents/${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: getBranch() }),
  });
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
    .map(
      (item, index) => `
      <div class="item-row" data-index="${index}">
        <img src="../${item.src}" alt="${item.title}">
        <div class="item-info">
          <h3>${item.title}</h3>
          <p>${item.category}</p>
        </div>
        <button class="btn btn-danger delete-btn" data-index="${index}">წაშლა</button>
      </div>
    `
    )
    .join('');

  itemsList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteItem(Number(btn.dataset.index)));
  });
}

async function refreshItems() {
  try {
    const data = await loadGalleryData();
    renderItems(data.items || []);
  } catch (err) {
    itemsList.innerHTML = `<p class="empty-list">${err.message}</p>`;
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
    const filename = `${Date.now()}-${slugify(title)}.${ext}`;
    const imagePath = `images/uploads/${filename}`;
    const base64 = await fileToBase64(file);

    await putBinaryFile(imagePath, base64, `Add image: ${title}`);

    const { content, sha } = await getFileContent('data/gallery.json');
    content.items.push({
      src: imagePath,
      title,
      category,
    });

    await putFile(
      'data/gallery.json',
      JSON.stringify(content, null, 2) + '\n',
      `Add gallery item: ${title}`,
      sha
    );

    uploadForm.reset();
    await refreshItems();
    setStatus('ფოტო წარმატებით აიტვირთა! საიტი განახლდება 1-2 წუთში.', 'success');
  } catch (err) {
    setStatus(err.message, 'error');
  } finally {
    uploadBtn.disabled = false;
  }
});

async function deleteItem(index) {
  if (!confirm('ნამდვილად გსურთ ამ ნამუშევრის წაშლა?')) return;

  setStatus('იშლება...', '');

  try {
    const { content, sha } = await getFileContent('data/gallery.json');
    const [removed] = content.items.splice(index, 1);

    await putFile(
      'data/gallery.json',
      JSON.stringify(content, null, 2) + '\n',
      `Remove gallery item: ${removed.title}`,
      sha
    );

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
