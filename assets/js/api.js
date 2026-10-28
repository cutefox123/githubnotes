/* GitHub Contents API 的小封装：读取密文、提交新文章。
   只在「写作」时需要 token；平时阅读不需要任何 GitHub 账号。 */

const API = 'https://api.github.com';
const TOKEN_STORE = 'sg.gh.token';

export function getToken() {
  try { return localStorage.getItem(TOKEN_STORE) || ''; } catch { return ''; }
}

export function setToken(t) {
  try {
    if (t) localStorage.setItem(TOKEN_STORE, t);
    else localStorage.removeItem(TOKEN_STORE);
  } catch { /* 隐私模式下忽略 */ }
}

function authHeaders(extra) {
  const t = getToken();
  return Object.assign({
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    ...(t ? { Authorization: 'Bearer ' + t } : {})
  }, extra || {});
}

async function req(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: authHeaders(opts.headers), cache: 'no-store' });
  if (res.status === 404) return { ok: false, status: 404, data: null };
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const msg = (data && data.message) || ('HTTP ' + res.status);
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return { ok: true, status: res.status, data };
}

function contentUrl(repo, path) {
  return API + '/repos/' + repo.owner + '/' + repo.name + '/contents/' + path.split('/').map(encodeURIComponent).join('/');
}

/* ---------- 读 ---------- */

export async function readFile(repo, path, branch) {
  const url = contentUrl(repo, path) + '?ref=' + encodeURIComponent(branch || 'main') + '&t=' + Date.now();
  const r = await req(url);
  if (!r.ok) return null;
  const d = r.data;
  if (!d || Array.isArray(d)) return null;
  const b64 = String(d.content || '').replace(/\n/g, '');
  return { sha: d.sha, base64: b64, size: d.size };
}

export async function readText(repo, path, branch) {
  const f = await readFile(repo, path, branch);
  if (!f) return null;
  return { sha: f.sha, text: decodeUtf8(f.base64) };
}

export async function readBytes(repo, path, branch) {
  const f = await readFile(repo, path, branch);
  if (!f) return null;
  return { sha: f.sha, bytes: b64ToBytes(f.base64) };
}

/* ---------- 写 ---------- */

export async function writeFile(repo, path, { text, base64, message, sha, branch }) {
  const body = {
    message: message || 'update ' + path,
    branch: branch || repo.branch || 'main',
    content: base64 != null ? base64 : b64FromUtf8(text || '')
  };
  if (sha) body.sha = sha;
  const r = await req(contentUrl(repo, path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.data;
}

export async function deleteFile(repo, path, { message, sha, branch }) {
  const r = await req(contentUrl(repo, path), {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message || 'delete ' + path, sha, branch: branch || repo.branch || 'main' })
  });
  return r.data;
}

/* ---------- 账号校验 ---------- */

export async function verify() {
  const r = await req(API + '/user');
  return r.data;
}

export async function repoInfo(repo) {
  const r = await req(API + '/repos/' + repo.owner + '/' + repo.name);
  return r.data;
}

/* ---------- 编码 ---------- */

export function b64FromUtf8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function b64ToBytes(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function decodeUtf8(b64) {
  return new TextDecoder().decode(b64ToBytes(b64));
}
