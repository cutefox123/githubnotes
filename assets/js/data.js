/* 内容层：从站点上取回密文 → 本机解密。
   阅读不需要 GitHub 账号，也不消耗 GitHub API 配额。 */

import { SITE } from './config.js';
import * as vault from './vault.js';
import { stripMarkdown } from './md.js';

const INDEX_CACHE = 'sg.index.v1';

/* 原生 App 里优先读线上那份密文，读不到再用包内副本 */
const REMOTE = SITE.remote && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()
  ? SITE.remote.replace(/\/?$/, '/')
  : '';

function urlsFor(path) {
  const clean = String(path || '').replace(/^\.\//, '');
  const list = [];
  if (REMOTE && !/^https?:/i.test(clean)) list.push(REMOTE + clean);
  list.push(clean);
  return list;
}

async function fetchFirst(path, as) {
  let lastErr = null;
  for (const url of urlsFor(path)) {
    const full = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
    try {
      const res = await fetch(full, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return as === 'json' ? await res.json() : new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('读取失败');
}
const imgCache = new Map();
let indexMemo = null;

function cacheIndex(data) {
  try {
    localStorage.setItem(INDEX_CACHE, JSON.stringify({ at: Date.now(), data }));
  } catch { /* 容量满了就放弃缓存 */ }
}

function readCachedIndex() {
  try {
    const raw = localStorage.getItem(INDEX_CACHE);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && obj.data ? obj.data : null;
  } catch {
    return null;
  }
}

export async function loadIndex({ fresh = false } = {}) {
  if (indexMemo && !fresh) return indexMemo;
  try {
    const payload = await fetchFirst(SITE.paths.index, 'json');
    const data = await vault.openJSON(payload);
    indexMemo = normalizeIndex(data);
    cacheIndex(indexMemo);
    return indexMemo;
  } catch (err) {
    const cached = readCachedIndex();
    if (cached) {
      indexMemo = normalizeIndex(cached);
      return indexMemo;
    }
    throw err;
  }
}

function normalizeIndex(data) {
  const posts = Array.isArray(data && data.posts) ? data.posts.slice() : [];
  posts.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return {
    v: (data && data.v) || 1,
    updatedAt: (data && data.updatedAt) || '',
    site: (data && data.site) || {},
    posts
  };
}

export async function loadPost(id) {
  let payload;
  try {
    payload = await fetchFirst(SITE.paths.posts + '/' + encodeURIComponent(id) + '.json', 'json');
  } catch (err) {
    throw new Error('日记读取失败（' + (err && err.message ? err.message : '网络') + '）');
  }
  return vault.openJSON(payload);
}

export async function loadImage(path) {
  if (!path) return '';
  if (imgCache.has(path)) return imgCache.get(path);
  const buf = await fetchFirst(path, 'bin');
  const bytes = await vault.openBytes(buf);
  const type = sniffType(bytes);
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  imgCache.set(path, url);
  return url;
}

function sniffType(b) {
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[8] === 0x57) return 'image/webp';
  if (b[0] === 0x47 && b[1] === 0x49) return 'image/gif';
  return 'image/jpeg';
}

export function readingTime(text) {
  const n = String(text || '').replace(/\s/g, '').length;
  return Math.max(1, Math.round(n / 380));
}

export function excerptOf(body, limit = 90) {
  const t = stripMarkdown(body || '');
  return t.length > limit ? t.slice(0, limit).trim() + '…' : t;
}

export function allTags(posts) {
  const map = new Map();
  for (const p of posts) {
    for (const t of p.tags || []) map.set(t, (map.get(t) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
}

export function clearImageCache() {
  for (const url of imgCache.values()) URL.revokeObjectURL(url);
  imgCache.clear();
}
