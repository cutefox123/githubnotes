/* 单篇日记 */

import { gate, applyTheme, bindThemeToggles, bindLockButton, toast, $, fmtDate, fmtDateLong } from './site.js';
import { loadPost, loadIndex, loadImage, readingTime } from './data.js';
import { renderMarkdown } from './md.js';
import { weatherIcon, icon } from './icons.js';
import { SITE } from './config.js';

const id = new URLSearchParams(location.search).get('id') || '';
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function headerScroll() {
  const bar = $('#appbar');
  if (!bar) return;
  const onScroll = () => bar.classList.toggle('is-stuck', window.scrollY > 6);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

async function boot() {
  applyTheme();
  bindThemeToggles();
  bindLockButton();
  headerScroll();

  await gate(async () => {
    if (!id) return fail('链接里没有日记编号');
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
  const kicker = $('#entryKicker');
  if (kicker) kicker.textContent = '';
  $('#entryTitle').textContent = '这一页没能打开';
  $('#entrySub').innerHTML = '';
  $('#entryBody').innerHTML =
    '<p style="text-align:center;color:var(--ink-2)">' + escapeHtml(message) +
    '<br><br>可能是链接不对，也可能是刚发布还没同步好。<br>' +
    '<a href="./index.html">回日记本看看 →</a></p>';
  toast('打不开这一篇', { tone: 'bad' });
}

function badge(kind, iconName, text) {
  if (!text) return '';
  return `<span class="badge ${kind}">${iconName ? icon(iconName) : ''}${escapeHtml(text)}</span>`;
}

async function render(post, index) {
  document.title = (post.title || '无题') + ' · ' + SITE.title;

  const d = new Date(String(post.date || '').length <= 10 ? post.date + 'T12:00:00' : post.date);
  const safe = isNaN(d.getTime()) ? new Date() : d;

  // 日期牌
  const mon = $('#dMon');
  const day = $('#dDay');
  const wk = $('#dWeek');
  const wx = $('#dWx');
  if (mon) mon.textContent = (safe.getMonth() + 1) + ' 月';
  if (day) day.textContent = String(safe.getDate()).padStart(2, '0');
  if (wk) wk.textContent = WEEK[safe.getDay()];
  if (wx) {
    wx.innerHTML = post.weather
      ? weatherIcon(post.weather) + '<span>' + escapeHtml(post.weather) + '</span>'
      : '';
    wx.hidden = !post.weather;
  }

  const kicker = $('#entryKicker');
  if (kicker) kicker.textContent = '日记 / ' + safe.getFullYear();

  $('#entryTitle').textContent = post.title || '无题';

  const sub = [];
  if (post.time) sub.push(badge('', 'clock', post.time));
  sub.push(badge('is-place', 'pin', post.place));
  sub.push(badge('is-mood', 'mood', post.mood));
  sub.push(badge('', '', readingTime(post.body) + ' 分钟'));
  $('#entrySub').innerHTML = sub.filter(Boolean).join('');

  // 正文
  const bodyEl = $('#entryBody');
  bodyEl.innerHTML = renderMarkdown(post.body || '');
  bodyEl.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'lazy'));

  // 照片
  const coverPath = post.coverFull || post.cover || '';
  if (coverPath) {
    const wrap = $('#entryCover');
    const img = $('#coverImg');
    wrap.hidden = false;
    img.alt = post.title || '';
    try {
      const url = await loadImage(coverPath);
      img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
      img.src = url;
    } catch {
      wrap.hidden = true;
    }
  }

  // 落款
  $('#entryEnd').hidden = false;
  const bits = ['记于 ' + fmtDateLong(post.date)];
  if (post.weather) bits.push(post.weather);
  if (post.time) bits.push(post.time);
  $('#entrySign').textContent = bits.join(' · ');
  const edit = $('#editBtn');
  if (edit) edit.href = './write.html?id=' + encodeURIComponent(post.id);

  // 前一天 / 后一天
  if (index && Array.isArray(index.posts) && index.posts.length > 1) {
    const pos = index.posts.findIndex((p) => p.id === post.id);
    const newer = pos > 0 ? index.posts[pos - 1] : null;
    const older = pos >= 0 && pos < index.posts.length - 1 ? index.posts[pos + 1] : null;
    const nav = $('#entryNav');
    const link = (p, dir, label) => p ? (
      `<a class="${dir}" href="./post.html?id=${encodeURIComponent(p.id)}">` +
      `<span>${label}</span><strong>${escapeHtml(p.title || '无题')}</strong></a>`
    ) : '';
    nav.innerHTML = [
      link(older, 'prev', '← 前一天'),
      link(newer, 'next', '后一天 →')
    ].join('');
    nav.hidden = false;
  }

  renderSide(post, index);
}

/* ---------------- 页边注 ---------------- */

function renderSide(post, index) {
  const side = $('#entrySide');
  if (!side) return;
  const blocks = [];

  const kv = [];
  if (post.date) kv.push(['日期', fmtDate(post.date)]);
  if (post.time) kv.push(['时间', post.time]);
  if (post.weather) kv.push(['天气', post.weather]);
  if (post.mood) kv.push(['心情', post.mood]);
  if (post.place) kv.push(['地点', post.place]);
  const chars = String(post.body || '').replace(/\s/g, '').length;
  if (chars) kv.push(['字数', chars + ' 字']);
  kv.push(['读完', readingTime(post.body) + ' 分钟']);

  blocks.push(
    '<div class="side-block"><h2 class="side-title">这一篇</h2><ul class="side-kv">' +
    kv.map(([k, v]) => `<li><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></li>`).join('') +
    '</ul></div>'
  );

  const tags = post.tags || [];
  if (tags.length) {
    blocks.push(
      '<div class="side-block"><h2 class="side-title">标签</h2><div class="side-tags">' +
      tags.map((t) => `<a href="./index.html?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`).join('') +
      '</div></div>'
    );
  }

  if (index && Array.isArray(index.posts) && index.posts.length > 1) {
    const recents = index.posts.filter((p) => p.id !== post.id).slice(0, 4);
    if (recents.length) {
      blocks.push(
        '<div class="side-block"><h2 class="side-title">最近也写了</h2><div class="side-list">' +
        recents.map((p) => (
          `<a href="./post.html?id=${encodeURIComponent(p.id)}">` +
          `<span class="t">${escapeHtml(p.title || '无题')}</span>` +
          `<span class="d">${fmtDate(p.date)}</span></a>`
        )).join('') +
        '</div></div>'
      );
    }
  }

  side.innerHTML = blocks.join('');
}

boot();
