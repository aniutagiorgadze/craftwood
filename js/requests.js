const REQUESTS_PATH = 'data/requests.json';
const LOCAL_REQUESTS_KEY = 'craftwood_requests';

let requestsQueue = Promise.resolve();

function enqueueRequests(task) {
  const next = requestsQueue.then(task, task);
  requestsQueue = next.catch(() => {});
  return next;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function encodeRepoPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
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

function isRequestsConflict(err) {
  return (
    err?.status === 409 ||
    (err?.message && err.message.includes('does not match'))
  );
}

function createRequestId() {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeRequest(request) {
  return {
    id: request.id || createRequestId(),
    phone: String(request.phone || '').trim(),
    message: String(request.message || '').trim(),
    date: request.date || new Date().toISOString().slice(0, 10),
    called: Boolean(request.called),
    adminNote: String(request.adminNote || '').trim(),
  };
}

async function githubFetch(token, path, options = {}) {
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
    const err = new Error(data.message || 'GitHub API შეცდომა');
    err.status = response.status;
    throw err;
  }
  return data;
}

async function getRequestsFile(token, repo, branch) {
  const [owner, repoName] = repo.split('/');
  try {
    const data = await githubFetch(
      token,
      `/repos/${owner}/${repoName}/contents/${encodeRepoPath(REQUESTS_PATH)}?ref=${branch}`
    );
    const content = JSON.parse(decodeBase64Utf8(data.content));
    return { content, sha: data.sha };
  } catch (err) {
    if (err.status === 404) {
      return { content: { requests: [] }, sha: null };
    }
    throw err;
  }
}

async function saveRequestsFile(token, repo, branch, content, message, sha) {
  const [owner, repoName] = repo.split('/');
  const body = {
    message,
    content: encodeUtf8Base64(JSON.stringify(content, null, 2) + '\n'),
    branch,
  };
  if (sha) body.sha = sha;

  return githubFetch(token, `/repos/${owner}/${repoName}/contents/${encodeRepoPath(REQUESTS_PATH)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function commitRequestsUpdate(token, repo, branch, mutator, message) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { content, sha } = await getRequestsFile(token, repo, branch);
    if (!Array.isArray(content.requests)) content.requests = [];
    const result = mutator(content);
    if (result === false) throw new Error('მოთხოვნა ვერ მოიძებნა.');
    try {
      await saveRequestsFile(token, repo, branch, content, message, sha);
      return content;
    } catch (err) {
      if (!isRequestsConflict(err) || attempt === 4) throw err;
      await sleep(350 * (attempt + 1));
    }
  }
  throw new Error('requests.json განახლება ვერ მოხერხდა.');
}

async function loadPublicRequests() {
  try {
    const response = await fetch(`${REQUESTS_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.requests) ? data.requests.map(normalizeRequest) : [];
  } catch {
    return [];
  }
}

function loadLocalRequests() {
  try {
    const raw = localStorage.getItem(LOCAL_REQUESTS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.requests) ? data.requests.map(normalizeRequest) : [];
  } catch {
    return [];
  }
}

function saveLocalRequest(request) {
  const entry = normalizeRequest(request);
  const requests = loadLocalRequests();
  requests.push(entry);
  localStorage.setItem(LOCAL_REQUESTS_KEY, JSON.stringify({ requests }, null, 2));
  return entry;
}

async function loadAllRequests() {
  const [server, local] = await Promise.all([
    loadPublicRequests(),
    Promise.resolve(loadLocalRequests()),
  ]);
  const merged = new Map();
  [...server, ...local].forEach((request) => merged.set(request.id, request));
  return Array.from(merged.values());
}

async function submitRequestToRepo(token, repo, branch, request) {
  const entry = normalizeRequest(request);
  if (!entry.phone || !entry.message) {
    throw new Error('ტელეფონი და მოთხოვნა სავალდებულოა.');
  }

  return enqueueRequests(() =>
    commitRequestsUpdate(
      token,
      repo,
      branch,
      (data) => {
        data.requests.push(entry);
        return true;
      },
      `Add consultation request: ${entry.phone}`
    )
  );
}

async function updateRequestFromRepo(token, repo, branch, requestId, updates) {
  return enqueueRequests(() =>
    commitRequestsUpdate(
      token,
      repo,
      branch,
      (data) => {
        const request = data.requests.find((r) => r.id === requestId);
        if (!request) return false;
        if (updates.called !== undefined) request.called = Boolean(updates.called);
        if (updates.adminNote !== undefined) request.adminNote = String(updates.adminNote).trim();
        return true;
      },
      `Update request ${requestId}`
    )
  );
}

async function deleteRequestFromRepo(token, repo, branch, requestId) {
  return enqueueRequests(() =>
    commitRequestsUpdate(
      token,
      repo,
      branch,
      (data) => {
        const index = data.requests.findIndex((r) => r.id === requestId);
        if (index === -1) return false;
        data.requests.splice(index, 1);
        return true;
      },
      `Delete request ${requestId}`
    )
  );
}

window.CraftwoodRequests = {
  loadPublicRequests,
  loadAllRequests,
  loadLocalRequests,
  saveLocalRequest,
  submitRequestToRepo,
  updateRequestFromRepo,
  deleteRequestFromRepo,
  getRequestsFile,
  normalizeRequest,
};
