const REVIEWS_PATH = 'data/reviews.json';
const LOCAL_REVIEWS_KEY = 'craftwood_reviews';

let reviewsQueue = Promise.resolve();

function enqueueReviews(task) {
  const next = reviewsQueue.then(task, task);
  reviewsQueue = next.catch(() => {});
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

function isReviewsConflict(err) {
  return (
    err?.status === 409 ||
    (err?.message && err.message.includes('does not match'))
  );
}

function createReviewId() {
  return `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeReview(review) {
  return {
    id: review.id || createReviewId(),
    itemSrc: String(review.itemSrc || '').trim(),
    author: String(review.author || '').trim(),
    text: String(review.text || '').trim(),
    rating: Math.max(1, Math.min(5, Number(review.rating) || 5)),
    date: review.date || new Date().toISOString().slice(0, 10),
    hidden: Boolean(review.hidden),
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

async function getReviewsFile(token, repo, branch) {
  const [owner, repoName] = repo.split('/');
  try {
    const data = await githubFetch(
      token,
      `/repos/${owner}/${repoName}/contents/${encodeRepoPath(REVIEWS_PATH)}?ref=${branch}`
    );
    const content = JSON.parse(decodeBase64Utf8(data.content));
    return { content, sha: data.sha };
  } catch (err) {
    if (err.status === 404) {
      return { content: { reviews: [] }, sha: null };
    }
    throw err;
  }
}

async function saveReviewsFile(token, repo, branch, content, message, sha) {
  const [owner, repoName] = repo.split('/');
  const body = {
    message,
    content: encodeUtf8Base64(JSON.stringify(content, null, 2) + '\n'),
    branch,
  };
  if (sha) body.sha = sha;

  return githubFetch(token, `/repos/${owner}/${repoName}/contents/${encodeRepoPath(REVIEWS_PATH)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function commitReviewsUpdate(token, repo, branch, mutator, message) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { content, sha } = await getReviewsFile(token, repo, branch);
    if (!Array.isArray(content.reviews)) content.reviews = [];
    const result = mutator(content);
    if (result === false) throw new Error('შეფასება ვერ მოიძებნა.');
    try {
      await saveReviewsFile(token, repo, branch, content, message, sha);
      return content;
    } catch (err) {
      if (!isReviewsConflict(err) || attempt === 4) throw err;
      await sleep(350 * (attempt + 1));
    }
  }
  throw new Error('reviews.json განახლება ვერ მოხერხდა.');
}

async function loadPublicReviews() {
  try {
    const response = await fetch(`${REVIEWS_PATH}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data.reviews) ? data.reviews.map(normalizeReview) : [];
  } catch {
    return [];
  }
}

function loadLocalReviews() {
  try {
    const raw = localStorage.getItem(LOCAL_REVIEWS_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data.reviews) ? data.reviews.map(normalizeReview) : [];
  } catch {
    return [];
  }
}

function saveLocalReview(review) {
  const entry = normalizeReview(review);
  const reviews = loadLocalReviews();
  reviews.push(entry);
  localStorage.setItem(LOCAL_REVIEWS_KEY, JSON.stringify({ reviews }, null, 2));
  return entry;
}

async function loadAllReviews() {
  const [server, local] = await Promise.all([
    loadPublicReviews(),
    Promise.resolve(loadLocalReviews()),
  ]);
  const merged = new Map();
  [...server, ...local].forEach((review) => merged.set(review.id, review));
  return Array.from(merged.values());
}

function getAverageRating(reviews) {
  if (!reviews.length) return 0;
  const sum = reviews.reduce((acc, r) => acc + (Number(r.rating) || 0), 0);
  return Math.round((sum / reviews.length) * 10) / 10;
}

function getVisibleReviewsForItem(allReviews, itemSrc) {
  return allReviews.filter((review) => review.itemSrc === itemSrc && !review.hidden);
}

async function submitReviewToRepo(token, repo, branch, review) {
  const entry = normalizeReview(review);
  if (!entry.itemSrc || !entry.author || !entry.text) {
    throw new Error('შეფასების ველები არასრულია.');
  }

  return enqueueReviews(() =>
    commitReviewsUpdate(
      token,
      repo,
      branch,
      (data) => {
        data.reviews.push(entry);
        return true;
      },
      `Add review for ${entry.itemSrc}`
    )
  );
}

async function setReviewHidden(token, repo, branch, reviewId, hidden) {
  return enqueueReviews(() =>
    commitReviewsUpdate(
      token,
      repo,
      branch,
      (data) => {
        const review = data.reviews.find((r) => r.id === reviewId);
        if (!review) return false;
        review.hidden = hidden;
        return true;
      },
      hidden ? `Hide review ${reviewId}` : `Show review ${reviewId}`
    )
  );
}

async function updateReviewFromRepo(token, repo, branch, reviewId, updates) {
  return enqueueReviews(() =>
    commitReviewsUpdate(
      token,
      repo,
      branch,
      (data) => {
        const review = data.reviews.find((r) => r.id === reviewId);
        if (!review) return false;
        if (updates.author !== undefined) review.author = String(updates.author).trim();
        if (updates.text !== undefined) review.text = String(updates.text).trim();
        if (updates.rating !== undefined) {
          review.rating = Math.max(1, Math.min(5, Number(updates.rating) || 5));
        }
        return true;
      },
      `Update review ${reviewId}`
    )
  );
}

async function deleteReviewFromRepo(token, repo, branch, reviewId) {
  return enqueueReviews(() =>
    commitReviewsUpdate(
      token,
      repo,
      branch,
      (data) => {
        const index = data.reviews.findIndex((r) => r.id === reviewId);
        if (index === -1) return false;
        data.reviews.splice(index, 1);
        return true;
      },
      `Delete review ${reviewId}`
    )
  );
}

async function updateReviewsItemSrc(token, repo, branch, oldSrc, newSrc) {
  return enqueueReviews(() =>
    commitReviewsUpdate(
      token,
      repo,
      branch,
      (data) => {
        data.reviews.forEach((review) => {
          if (review.itemSrc === oldSrc) review.itemSrc = newSrc;
        });
        return true;
      },
      `Update review links: ${oldSrc}`
    )
  );
}

async function deleteReviewsForItem(token, repo, branch, itemSrc) {
  return enqueueReviews(() =>
    commitReviewsUpdate(
      token,
      repo,
      branch,
      (data) => {
        data.reviews = data.reviews.filter((review) => review.itemSrc !== itemSrc);
        return true;
      },
      `Delete reviews for ${itemSrc}`
    )
  );
}

window.CraftwoodReviews = {
  loadPublicReviews,
  loadAllReviews,
  loadLocalReviews,
  saveLocalReview,
  getAverageRating,
  getVisibleReviewsForItem,
  submitReviewToRepo,
  setReviewHidden,
  updateReviewFromRepo,
  deleteReviewFromRepo,
  updateReviewsItemSrc,
  deleteReviewsForItem,
  getReviewsFile,
  normalizeReview,
};
