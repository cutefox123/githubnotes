/* 首页：解锁 → 取回目录 → 渲染封面故事 + 卡片流 */

import { gate, applyTheme, bindThemeToggles, bindLockButton, toast, $, fmtDate, monthEn, parseDate } from './site.js';
import { loadIndex, loadImage, allTags, readingTime } from './data.js';
import { SITE } from './config.js';

const state = { posts: [], tag: '', q: '', io: null };

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const escapeAttr = escapeHtml;

function headerScroll() {
  const header = $('#siteHeader');
  if (!header) return;
  const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------------- 图片懒加载 ---------------- */

async function loadCover(img) {
  if (img.dataset.loaded) return;
  img.dataset.loaded = '1';
  try {
    const url = await loadImage(img.dataset.src);
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    img.src = url;
  } catch {
    const media = img.closest('.card-media, .feature-media');
    if (media) media.classList.add('no-img');
    img.remove();
  }
}

function observeImages(root) {
  const imgs = Array.from(root.querySelectorAll('img[data-src]'));
  if (!imgs.length) return;

  if (!('IntersectionObserver' in window)) {
    imgs.forEach(loadCover);
    return;
  }

  if (!state.io) {
    state.io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        state.io.unobserve(e.target);
        loadCover(e.target);
      });
    }, { rootMargin: '400px 0px' });
  }

  imgs.forEach((img) => state.io.observe(img));
}

/* ---------------- 卡片 ---------------- */

function metaBits(p, withYear) {
  const d = parseDate(p.date);
  const bits = [`<span>${monthEn(p.date)} ${d.getDate()}${withYear ? ', ' + d.getFullYear() : ''}</span>`];
  if (p.weather) bits.push('<i class="dot"></i><span>' + escapeHtml(p.weather) + '</span>');
  if (p.place) bits.push('<i class="dot"></i><span>' + escapeHtml(p.place) + '</span>');
  return bits.join('');
}

function featureEl(p) {
  const a = document.createElement('a');
  a.className = 'feature';
  a.href = './post.html?id=' + encodeURIComponent(p.id);
  a.innerHTML = `
    <div class="feature-media">
      ${p.cover ? `<img data-src="${p.cover}" alt="${escapeAttr(p.title)}">` : ''}
    </div>
    <div class="feature-body">
      <p class="feature-label">LATEST · 最新一篇</p>
      <h2 class="feature-title">${escapeHtml(p.title || '无题')}</h2>
      ${p.excerpt ? `<p class="feature-excerpt">${escapeHtml(p.excerpt)}</p>` : ''}
      <div class="feature-meta">${metaBits(p, true)}</div>
      <span class="feature-more">读这篇 →</span>
    </div>`;
  return a;
}

function cardEl(p) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = './post.html?id=' + encodeURIComponent(p.id);

  const minutes = p.reading || readingTime(p.excerpt || '');
  const tags = (p.tags || []).slice(0, 2).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');

  a.innerHTML = `
    <div class="card-media">
      ${p.cover ? `<img data-src="${p.cover}" alt="${escapeAttr(p.title)}" loading="lazy">` : ''}
    </div>
    <div class="card-body">
      <div class="card-meta">${metaBits(p, false)}</div>
      <h2 class="card-title">${escapeHtml(p.title || '无题')}</h2>
      ${p.excerpt ? `<p class="card-excerpt">${escapeHtml(p.excerpt)}</p>` : ''}
      <div class="card-foot">
        <span>${minutes} 分钟</span>
        ${tags}
      </div>
    </div>`;
  return a;
}

function filtered() {
  const q = state.q.trim().toLowerCase();
  return state.posts.filter((p) => {
    if (state.tag && !(p.tags || []).includes(state.tag)) return false;
    if (!q) return true;
    const hay = [p.title, p.excerpt, (p.tags || []).join(' '), p.place, p.mood, p.weather]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

function renderChips() {
  const box = $('#chips');
  if (!box) return;
  const tags = allTags(state.posts).slice(0, 7);
  const items = [{ name: '', label: '全部' }, ...tags.map((t) => ({ name: t.name, label: t.name }))];
  box.innerHTML = items.map((t) => (
    `<button class="chip${t.name === state.tag ? ' is-on' : ''}" data-tag="${escapeAttr(t.name)}">${escapeHtml(t.label)}</button>`
  )).join('');
  box.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tag = btn.dataset.tag || '';
      renderChips();
      renderGrid();
    });
  });
}

function renderGrid() {
  const grid = $('#grid');
  const featureWrap = $('#featureWrap');
  if (!grid) return;
  const list = filtered();
  grid.innerHTML = '';
  if (featureWrap) featureWrap.innerHTML = '';

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><strong>这里还是空的</strong>${
      state.posts.length ? '换个词再找找看' : '写第一篇吧，哪怕只有一句话'
    }</div>`;
    return;
  }

  const showFeature = !state.tag && !state.q;
  if (showFeature && featureWrap) {
    featureWrap.appendChild(featureEl(list[0]));
    observeImages(featureWrap);
  }

  const rest = showFeature ? list.slice(1) : list;
  if (!rest.length) return;

  const frag = document.createDocumentFragment();
  rest.forEach((p, i) => {
    const el = cardEl(p);
    el.style.animationDelay = Math.min(i * 45, 360) + 'ms';
    frag.appendChild(el);
  });
  grid.appendChild(frag);
  observeImages(grid);
}

/* ---------------- 头版 ---------------- */

function renderHero(index) {
  const posts = index.posts || [];
  const side = $('#heroSide');
  const sub = $('#heroSub');
  const kicker = $('#heroKicker');

  if (kicker && SITE.since) kicker.textContent = SITE.titleEn + ' · SINCE ' + SITE.since;
  if (sub) sub.textContent = SITE.tagline;

  if (side) {
    if (!posts.length) {
      side.innerHTML = '<strong>0</strong><span class="unit">篇</span><span class="sep">/</span><span>等待落笔</span>';
    } else {
      side.innerHTML = `<strong>${posts.length}</strong><span class="unit">篇</span><span class="sep">/</span><span>最近 ${fmtDate(posts[0].date)}</span>`;
    }
  }

  const foot = $('#footNote');
  if (foot && posts.length) foot.textContent = '共 ' + posts.length + ' 篇 · 内容以密文存放';
}

/* ---------------- 启动 ---------------- */

async function boot() {
  applyTheme();
  bindThemeToggles();
  bindLockButton();
  headerScroll();

  const q = $('#q');
  if (q) {
    q.addEventListener('input', () => {
      state.q = q.value;
      renderGrid();
    });
  }

  await gate(async () => {
    try {
      const index = await loadIndex();
      state.posts = index.posts || [];
      renderHero(index);
      renderChips();
      renderGrid();
    } catch (err) {
      const grid = $('#grid');
      if (grid) {
        grid.innerHTML = `<div class="empty-state"><strong>没能打开目录</strong>${
          escapeHtml(err.message || '网络或配置出了点问题')
        }<br><br>可以刷新页面再试一次。</div>`;
      }
      toast('读取失败：' + (err.message || '未知错误'), { tone: 'bad' });
    }
  });
}

boot();
