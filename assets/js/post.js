/* 单篇文章页 */

import { gate, applyTheme, bindThemeToggles, bindLockButton, toast, $, fmtDate, fmtDateLong } from './site.js';
import { loadPost, loadIndex, loadImage, readingTime } from './data.js';
import { renderMarkdown } from './md.js';
import { SITE } from './config.js';

const id = new URLSearchParams(location.search).get('id') || '';

function headerScroll() {
  const header = $('#siteHeader');
  if (!header) return;
  const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

async function boot() {
  applyTheme();
  bindThemeToggles();
  bindLockButton();
  headerScroll();

  await gate(async () => {
    if (!id) return fail('链接里没有文章编号');
    try {
      const [post, index] = await Promise.all([
        loadPost(id),
        loadIndex().catch(() => null)
      ]);
      render(post, index);
    } catch (err) {
      fail(err.message || '读取失败');
    }
  });
}

function fail(message) {
  $('#postKicker').textContent = '';
  $('#postTitle').textContent = '这一页没能打开';
  $('#postMeta').innerHTML = '';
  $('#postBody').innerHTML =
    '<p style="text-align:center;color:var(--ink-2)">' + escapeHtml(message) +
    '<br><br>可能是链接不对，也可能是刚发布还没同步好。<br>' +
    '<a href="./index.html">回首页看看 →</a></p>';
  toast('打不开这篇', { tone: 'bad' });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function render(post, index) {
  document.title = (post.title || '无题') + ' · ' + SITE.title;

  $('#postKicker').textContent = SITE.title + ' / 日常记录';
  $('#postTitle').textContent = post.title || '无题';

  const meta = [];
  meta.push('<span>' + fmtDateLong(post.date) + '</span>');
  if (post.weather) meta.push('<span>' + escapeHtml(post.weather) + '</span>');
  if (post.place) meta.push('<span>' + escapeHtml(post.place) + '</span>');
  if (post.mood) meta.push('<span class="pill">' + escapeHtml(post.mood) + '</span>');
  meta.push('<span>' + readingTime(post.body) + ' 分钟</span>');
  $('#postMeta').innerHTML = meta.join('');

  const bodyEl = $('#postBody');
  bodyEl.innerHTML = renderMarkdown(post.body || '');
  // 正文里的图片也懒加载
  bodyEl.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'lazy'));

  // 封面
  const coverPath = post.coverFull || post.cover || '';
  if (coverPath) {
    const cover = $('#postCover');
    const img = $('#coverImg');
    cover.hidden = false;
    img.alt = post.title || '';
    try {
      const url = await loadImage(coverPath);
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      img.src = url;
    } catch {
      cover.hidden = true;
    }
  }

  // 落款
  $('#postEnd').hidden = false;
  const bits = ['记于 ' + fmtDateLong(post.date)];
  if (post.weather) bits.push(post.weather);
  $('#postSign').textContent = bits.join(' · ');
  const edit = $('#editBtn');
  if (edit) edit.href = './write.html?id=' + encodeURIComponent(post.id);

  // 上下篇
  if (index && Array.isArray(index.posts) && index.posts.length > 1) {
    const pos = index.posts.findIndex((p) => p.id === post.id);
    const newer = pos > 0 ? index.posts[pos - 1] : null;
    const older = pos >= 0 && pos < index.posts.length - 1 ? index.posts[pos + 1] : null;
    const nav = $('#postNav');
    const link = (p, dir, label) => p ? (
      `<a class="${dir}" href="./post.html?id=${encodeURIComponent(p.id)}">` +
      `<span>${label}</span><strong>${escapeHtml(p.title || '无题')}</strong></a>`
    ) : '';
    nav.innerHTML = [
      link(older, 'prev', '← 更早'),
      link(newer, 'next', '更晚 →')
    ].join('');
    nav.hidden = false;
  }

  renderSide(post, index);
}

/* ---------------- 页边注 ---------------- */

function renderSide(post, index) {
  const side = $('#postSide');
  if (!side) return;

  const blocks = [];

  const tags = post.tags || [];
  if (tags.length) {
    blocks.push(
      '<div class="side-block"><h2 class="side-title">标签</h2><div class="side-tags">' +
      tags.map((t) => `<a href="./index.html?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('') +
      '</div></div>'
    );
  }

  const kv = [];
  if (post.date) kv.push(['日期', fmtDateLong(post.date)]);
  if (post.weather) kv.push(['天气', post.weather]);
  if (post.mood) kv.push(['心情', post.mood]);
  if (post.place) kv.push(['地点', post.place]);
  const chars = (post.body || '').replace(/\s/g, '').length;
  if (chars) kv.push(['字数', chars + ' 字']);
  kv.push(['读完', readingTime(post.body) + ' 分钟']);

  blocks.push(
    '<div class="side-block"><h2 class="side-title">这一篇</h2><ul class="side-kv">' +
    kv.map(([k, v]) => `<li><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></li>`).join('') +
    '</ul></div>'
  );

  if (index && Array.isArray(index.posts) && index.posts.length > 1) {
    const recents = index.posts.filter((p) => p.id !== post.id).slice(0, 4);
    if (recents.length) {
      blocks.push(
        '<div class="side-block"><h2 class="side-title">最近也写了</h2><ul class="side-list">' +
        recents.map((p) => (
          `<li><a href="./post.html?id=${encodeURIComponent(p.id)}">` +
          `<span class="t">${escapeHtml(p.title || '无题')}</span>` +
          `<span class="d">${fmtDate(p.date)}</span></a></li>`
        )).join('') +
        '</ul></div>'
      );
    }
  }

  side.innerHTML = blocks.join('');
}

boot();
