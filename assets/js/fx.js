/* 交互层：滚动揭示、按钮水波纹、数字滚动、进度条。
   只做「锦上添花」，任何一步失败都不影响读写日记。 */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const raf = requestAnimationFrame;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------------- 背景层 ---------------- */

function mountLayers() {
  if (!document.body) return;
  if (!$('.scroll-progress')) {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
  }
}

/* 右下角的「写一篇」，只在日记/关于页出现 */
function mountFab() {
  if (!/index\.html?$|\/$/.test(location.pathname)) return;
  if ($('.fab')) return;
  const a = document.createElement('a');
  a.className = 'fab';
  a.href = './write.html';
  a.setAttribute('aria-label', '写一篇日记');
  a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4.6 19.4l1-4.6L15.8 4.6a2 2 0 0 1 2.8 2.8L8.4 17.6z"/><path d="M14 6.4l3.6 3.6"/></svg>';
  document.body.appendChild(a);
}

/* ---------------- 滚动：进度条 + 顶栏 + FAB ---------------- */

function bindScroll() {
  const bar = $('.scroll-progress');
  const appbar = $('#appbar');
  const fab = $('.fab');
  let ticking = false;

  const update = () => {
    ticking = false;
    const h = document.documentElement.scrollHeight - window.innerHeight;
    const y = window.scrollY;
    const p = h > 8 ? Math.min(1, Math.max(0, y / h)) : 0;
    if (bar) {
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      bar.classList.toggle('is-on', p > 0.008);
    }
    if (appbar) appbar.classList.toggle('is-stuck', y > 6);
    if (fab) fab.classList.toggle('is-on', y > 180);
  };

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; raf(update); }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
}

/* ---------------- 滚动揭示 ---------------- */

const REVEAL_SEL = [
  '.entry', '.card', '.about-card', '.side-card', '.kv-table',
  '.book-head', '.toolbar', '.entry-head', '.write-head',
  '.entry-nav', '.token-box', '.entry-side', '.month-bar'
].join(',');

let io = null;

function watchOne(el) {
  if (!el || el.dataset.reveal === '1' || el.classList.contains('reveal')) return;
  el.dataset.reveal = '1';
  el.classList.add('reveal');
  if (io) io.observe(el);
  else el.classList.add('is-in');
}

function bindReveal() {
  if (reduceMotion || !('IntersectionObserver' in window)) return;

  io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const sibs = el.parentElement ? Array.from(el.parentElement.children).filter((n) => n.classList.contains('reveal')) : [el];
      const idx = Math.min(sibs.indexOf(el), 6);
      el.style.setProperty('--d', Math.max(0, idx * 55) + 'ms');
      el.classList.add('is-in');
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });

  const scan = (root = document) => {
    $$(REVEAL_SEL, root).forEach((el) => {
      if (el.closest('.lock')) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.96) {
        el.classList.add('is-in');
      }
      watchOne(el);
    });
  };

  scan();
  new MutationObserver((muts) => {
    for (const m of muts) {
      m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.matches && n.matches(REVEAL_SEL)) watchOne(n);
        if (n.querySelectorAll) $$(REVEAL_SEL, n).forEach(watchOne);
      });
    }
  }).observe(document.body, { childList: true, subtree: true });

  /* 兜底：万一观察器没触发，2.6 秒后全部显示，绝不留白 */
  setTimeout(() => {
    $$('.reveal:not(.is-in)').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight) el.classList.add('is-in');
    });
  }, 2600);
}

/* ---------------- 水波纹 ---------------- */

function bindRipple() {
  if (reduceMotion) return;
  const sel = '.icon-btn, .chip, .tab, .btn, .ghost-btn, .fab, .cal-nav button, .tab-mini';
  document.addEventListener('pointerdown', (e) => {
    const t = e.target.closest(sel);
    if (!t) return;
    const r = t.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.1;
    const s = document.createElement('span');
    s.className = 'ripple';
    s.style.width = s.style.height = size + 'px';
    s.style.left = (e.clientX - r.left - size / 2) + 'px';
    s.style.top = (e.clientY - r.top - size / 2) + 'px';
    t.appendChild(s);
    setTimeout(() => s.remove(), 640);
  }, { passive: true });
}

/* ---------------- 数字滚动 ---------------- */

function animateNumber(el) {
  const raw = el.textContent.trim();
  if (!/^\d[\d,]*$/.test(raw)) return;
  const target = parseInt(raw.replace(/,/g, ''), 10);
  if (!Number.isFinite(target) || target <= 0 || target > 100000) return;
  if (reduceMotion) return;
  if (el.dataset.counted === raw) return;
  el.dataset.counted = raw;

  const dur = 620;
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = String(Math.round(target * eased));
    if (p < 1) raf(tick);
    else el.textContent = raw;
  };
  raf(tick);
}

function bindCounters() {
  const sel = '.stat b, .kpi-row b, #statTotal, #statMonth, #statStreak';
  const seen = new WeakSet();
  const run = () => $$(sel).forEach((el) => {
    if (seen.has(el)) return;
    if (!/^\d/.test(el.textContent.trim())) return;
    seen.add(el);
    animateNumber(el);
  });
  run();
  let t = 0;
  new MutationObserver(() => {
    clearTimeout(t);
    t = setTimeout(run, 120);
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
}

/* ---------------- 启动 ---------------- */

function boot() {
  mountLayers();
  mountFab();
  bindScroll();
  bindReveal();
  bindRipple();
  bindCounters();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
