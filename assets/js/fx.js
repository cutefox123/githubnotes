/* 交互层：光效元素、指针跟随、滚动揭示、按钮水波纹、数字滚动。
   只做「锦上添花」，任何一步失败都不影响读写日记。 */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const raf = requestAnimationFrame;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------------- 背景层 ---------------- */

function mountLayers() {
  if (!document.body) return;
  const frag = document.createDocumentFragment();

  if (!$('.aurora')) {
    const aurora = document.createElement('div');
    aurora.className = 'aurora';
    aurora.setAttribute('aria-hidden', 'true');
    frag.appendChild(aurora);
  }
  if (!$('#glow')) {
    const glow = document.createElement('div');
    glow.id = 'glow';
    glow.setAttribute('aria-hidden', 'true');
    frag.appendChild(glow);
  }
  if (!$('#shade')) {
    const shade = document.createElement('div');
    shade.id = 'shade';
    shade.setAttribute('aria-hidden', 'true');
    frag.appendChild(shade);
  }
  if (!$('.scroll-progress')) {
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    bar.setAttribute('aria-hidden', 'true');
    frag.appendChild(bar);
  }
  document.body.appendChild(frag);
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

/* ---------------- 指针：聚光 + 本子侧转 ---------------- */

function bindPointer() {
  if (reduceMotion || !finePointer) return;

  let px = window.innerWidth * 0.62;
  let py = window.innerHeight * 0.3;
  let cx = px;
  let cy = py;
  let ticking = false;

  const paint = () => {
    ticking = false;
    cx += (px - cx) * 0.16;
    cy += (py - cy) * 0.16;
    document.documentElement.style.setProperty('--gx', cx.toFixed(1) + 'px');
    document.documentElement.style.setProperty('--gy', cy.toFixed(1) + 'px');
    if (Math.abs(px - cx) > 0.4 || Math.abs(py - cy) > 0.4) raf(paint);
  };

  window.addEventListener('pointermove', (e) => {
    px = e.clientX;
    py = e.clientY;
    document.body.classList.add('is-pointer');
    if (!ticking) {
      ticking = true;
      raf(paint);
    }
  }, { passive: true });

  /* 本子跟着光标轻轻侧转 */
  const books = $$('.book');
  const large = window.matchMedia('(min-width: 1024px)');

  const tilt = (book, e) => {
    const r = book.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width - 0.5;
    const ny = (e.clientY - r.top) / r.height - 0.5;
    const max = book.classList.contains('lock-card') ? 4 : 1.5;
    book.style.setProperty('--tx', (-ny * max).toFixed(2) + 'deg');
    book.style.setProperty('--ty', (nx * max * 1.25).toFixed(2) + 'deg');
    book.style.setProperty('--bx', ((nx + 0.5) * 100).toFixed(1) + '%');
    book.style.setProperty('--by', ((ny + 0.5) * 100).toFixed(1) + '%');
  };

  books.forEach((book) => {
    book.addEventListener('pointerenter', () => {
      if (!large.matches) return;
      book.classList.add('is-tilting');
    });
    book.addEventListener('pointermove', (e) => {
      if (!large.matches || !book.classList.contains('is-tilting')) return;
      tilt(book, e);
    }, { passive: true });
    book.addEventListener('pointerleave', () => {
      book.classList.remove('is-tilting');
      book.style.setProperty('--tx', '0deg');
      book.style.setProperty('--ty', '0deg');
    });
  });

  /* 锁屏卡片也来一点 */
  const lockCard = () => {
    const card = $('.lock-card');
    if (!card || card.dataset.tilt) return;
    card.dataset.tilt = '1';
    card.classList.add('tiltable');
    card.addEventListener('pointerenter', () => card.classList.add('is-tilting'));
    card.addEventListener('pointermove', (e) => {
      if (!large.matches) return;
      const r = card.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5;
      const ny = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateX(${(-ny * 5).toFixed(2)}deg) rotateY(${(nx * 6).toFixed(2)}deg)`;
    }, { passive: true });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; card.classList.remove('is-tilting'); });
  };
  lockCard();
  new MutationObserver(lockCard).observe(document.body, { childList: true });
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
  bindPointer();
  bindScroll();
  bindReveal();
  bindRipple();
  bindCounters();

  /* three.js 很重，等首屏稳定后再加载 */
  const start3d = () => {
    import('./scene.js')
      .then((m) => m.initScene())
      .catch(() => { /* 没有 WebGL 就算了，CSS 光斑还在 */ });
  };
  if ('requestIdleCallback' in window) requestIdleCallback(start3d, { timeout: 1800 });
  else setTimeout(start3d, 900);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
