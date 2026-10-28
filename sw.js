/* 墨记 InkNote — Service Worker
   页面与脚本走「网络优先」，保证更新能立刻生效；图标等静态资源「缓存优先」。
   离线时一律回落到缓存，所以断网依然可以书写。 */

const VERSION = 'inknote-v1.0.4';
const CACHE = 'inknote-shell-' + VERSION;

const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/app.bin',
  './assets/js/loader.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
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

async function networkFirst(req, cacheKey) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: 'no-store' });
    if (res && res.status === 200 && res.type === 'basic') cache.put(cacheKey || req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(cacheKey || req);
    if (cached) return cached;
    if (req.mode === 'navigate') {
      return (await cache.match('./index.html')) || (await cache.match('./'));
    }
    return new Response('', { status: 504, statusText: '离线' });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // GitHub API 等外部请求交给网络

  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }

  if (/\.(?:js|css|bin|webmanifest)$/.test(url.pathname)) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(cacheFirst(req).catch(() => new Response('', { status: 504 })));
});
