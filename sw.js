/* 拾光日记 · Service Worker
   壳（页面、样式、脚本）走网络优先，保证更新立刻生效；
   文章与封面的密文也走网络优先，但缓存键去掉时间戳参数，离线时仍能翻旧文章。 */

const VERSION = 'diary-v3.0.2';
const CACHE = 'shiguang-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './post.html',
  './write.html',
  './about.html',
  './manifest.webmanifest',
  './assets/css/blog.css',
  './assets/css/fx.css',
  './assets/fonts/inter-latin-var.woff2',
  './assets/fonts/jetbrains-mono-latin-var.woff2',
  './assets/js/config.js',
  './assets/js/crypto.js',
  './assets/js/vault.js',
  './assets/js/data.js',
  './assets/js/md.js',
  './assets/js/site.js',
  './assets/js/icons.js',
  './assets/js/home.js',
  './assets/js/post.js',
  './assets/js/write.js',
  './assets/js/api.js',
  './assets/js/fx.js',
  './assets/lock.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function keyOf(url) {
  return url.origin + url.pathname;
}

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res && res.status === 200 && res.type === 'basic') cache.put(key || req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(key || req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      return (await cache.match('./index.html')) || new Response('离线中', { status: 504 });
    }
    return new Response('', { status: 504, statusText: 'offline' });
  }
}

async function cacheFirst(req, key) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(key || req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.status === 200 && res.type === 'basic') cache.put(key || req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // GitHub API 之类交给网络

  // 密文内容：忽略 ?t= 之类的缓存穿透参数
  if (/\/(posts|media)\//.test(url.pathname)) {
    event.respondWith(networkFirst(req, keyOf(url)));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, keyOf(url)));
    return;
  }

  if (/\.(?:js|css|json|webmanifest)$/.test(url.pathname)) {
    event.respondWith(networkFirst(req, keyOf(url)));
    return;
  }

  event.respondWith(cacheFirst(req, keyOf(url)).catch(() => new Response('', { status: 504 })));
});
