/* 首页：解锁 → 取回目录 → 渲染文章流 + 右栏 */

import { gate, applyTheme, bindThemeToggles, bindLockButton, toast, $, fmtDate } from './site.js';
import { loadIndex, loadImage, allTags } from './data.js';
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
    const media = img.closest('.row-thumb');
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

/* ---------------- 单条 ---------------- */

function metaBits(p) {
  const bits = [`<span>${fmtDate(p.date)}</span>`];
  if (p.weather) bits.push('<span>' + escapeHtml(p.weather) + '</span>');
  if (p.place) bits.push('<span>' + escapeHtml(p.place) + '</span>');
  if (p.reading) bits.push('<span>' + p.reading + ' 分钟</span>');
  return bits.join('');
}

function rowEl(p, isLatest) {
  const a = document.createElement('a');
  a.className = 'row';
  a.href = './post.html?id=' + encodeURIComponent(p.id);

  const tags = (p.tags || []).slice(0, 3)
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  const badge = isLatest ? '<span class="row-badge">最新</span>' : '';
  const foot = (badge + tags) ? `<div class="row-foot">${badge}${tags}</div>` : '';

  a.innerHTML = `
    <div class="row-thumb">
      ${p.cover ? `<img data-src="${p.cover}" alt="${escapeAttr(p.title)}" loading="lazy">` : ''}
    </div>
    <div class="row-main">
      <div class="row-meta">${metaBits(p)}</div>
      <h2 class="row-title">${escapeHtml(p.title || '无题')}</h2>
      ${p.excerpt ? `<p class="row-excerpt">${escapeHtml(p.excerpt)}</p>` : ''}
      ${foot}
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

/* ---------------- 筛选条 + 右栏标签 ---------------- */

function setTag(name) {
  state.tag = name;
  renderFilters();
  renderGrid();
}

function renderFilters() {
  const box = $('#chips');
  const listEl = $('#tagList');
  const tags = allTags(state.posts);

  if (box) {
    const items = [{ name: '', label: '全部' }, ...tags.map((t) => ({ name: t.name, label: t.name }))];
    box.innerHTML = items.map((t) => (
      `<button class="chip${t.name === state.tag ? ' is-on' : ''}" data-tag="${escapeAttr(t.name)}">${escapeHtml(t.label)}</button>`
    )).join('');
    box.querySelectorAll('.chip').forEach((btn) => {
      btn.addEventListener('click', () => setTag(btn.dataset.tag || ''));
    });
  }

  if (listEl) {
    listEl.innerHTML = tags.map((t) => (
      `<li><button class="${t.name === state.tag ? 'is-on' : ''}" data-tag="${escapeAttr(t.name)}">` +
      `<span>${escapeHtml(t.name)}</span><span class="n">${t.count}</span></button></li>`
    )).join('');
    listEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => setTag(btn.dataset.tag === state.tag ? '' : btn.dataset.tag));
    });
  }

  const count = $('#tagCount');
  if (count) count.textContent = tags.length ? tags.length + ' 个' : '';
}

function renderGrid() {
  const grid = $('#grid');
  if (!grid) return;
  const list = filtered();
  grid.innerHTML = '';

  if (!list.length) {
    grid.innerHTML = `<div class="empty-state"><strong>这里还是空的</strong>${
      state.posts.length ? '换个词，或者点「全部」再看看' : '写第一篇吧，哪怕只有一句话'
    }</div>`;
    return;
  }

  const showLatest = !state.tag && !state.q;
  const frag = document.createDocumentFragment();
  list.forEach((p, i) => {
    const el = rowEl(p, showLatest && i === 0);
    el.style.animationDelay = Math.min(i * 40, 320) + 'ms';
    frag.appendChild(el);
  });
  grid.appendChild(frag);
  observeImages(grid);
}

/* ---------------- 头版与右栏 ---------------- */

function renderMeta(index) {
  const posts = index.posts || [];
  const kicker = $('#heroKicker');
  const sub = $('#heroSub');
  const side = $('#heroSide');

  if (kicker) kicker.textContent = SITE.titleEn + ' · since ' + SITE.since;
  if (sub) sub.textContent = SITE.tagline;

  const count = posts.length;
  const latest = count ? fmtDate(posts[0].date) : '—';

  if (side) {
    side.innerHTML = `
      <div><dt>篇数</dt><dd>${count || '0'}</dd></div>
      <div><dt>最近</dt><dd>${latest}</dd></div>
      <div><dt>存放</dt><dd>密文</dd></div>`;
  }

  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('#railSince', String(SITE.since));
  set('#railCount', count ? count + ' 篇' : '0 篇');
  set('#railLatest', latest);

  const foot = $('#footNote');
  if (foot && count) foot.textContent = '共 ' + count + ' 篇 · 内容以密文存放';
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
      renderMeta(index);
      renderFilters();
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
