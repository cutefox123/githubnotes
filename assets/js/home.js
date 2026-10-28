/* 日记首页：解锁 → 取回目录 → 文字流 + 日历 + 统计 */

import { gate, applyTheme, bindThemeToggles, bindLockButton, toast, $, parseDate, fmtDate } from './site.js';
import { loadIndex, allTags } from './data.js';
import { weatherIcon, icon } from './icons.js';
import { SITE } from './config.js';

const state = { posts: [], mode: 'all', tag: '', day: '', q: '', ym: '' };

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
const escapeAttr = escapeHtml;

const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const ymOf = (d) => String(ymd(d)).slice(0, 7);

function headerScroll() {
  const bar = $('#appbar');
  if (!bar) return;
  const onScroll = () => bar.classList.toggle('is-stuck', window.scrollY > 6);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ---------------- 统计 ---------------- */

function streakOf(posts) {
  const days = new Set(posts.map((p) => p.date).filter(Boolean));
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  if (!days.has(ymd(d))) {
    d.setDate(d.getDate() - 1);
    if (!days.has(ymd(d))) return 0;
  }
  let n = 0;
  while (days.has(ymd(d))) {
    n++;
    d.setDate(d.getDate() - 1);
    if (n > 4000) break;
  }
  return n;
}

function renderStats() {
  const posts = state.posts;
  const now = new Date();
  const thisMonth = ymOf(now);
  const monthCount = posts.filter((p) => String(p.date || '').slice(0, 7) === thisMonth).length;
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const tags = allTags(posts);

  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  set('#statStreak', String(streakOf(posts)));
  set('#statMonth', String(monthCount));
  set('#statTotal', String(posts.length));

  set('#kpiMonth', monthCount + ' 篇');
  set('#kpiTotal', posts.length + ' 篇');
  set('#kpiTags', tags.length + ' 个');
  set('#kpiSince', posts.length ? fmtDate(posts[posts.length - 1].date) : '—');

  const bar = $('#kpiBar');
  if (bar) bar.style.width = Math.min(100, Math.round((monthCount / days) * 100)) + '%';

  set('#tagCnt2', tags.length ? String(tags.length) : '');
  set('#footNote', posts.length ? '共 ' + posts.length + ' 篇 · 内容以密文存放' : '内容以密文存放');

  const kicker = $('#heroKicker');
  if (kicker) kicker.textContent = 'private diary · since ' + SITE.since;
  const sub = $('#heroSub');
  if (sub) sub.textContent = SITE.tagline;
}

/* ---------------- 日历 ---------------- */

function renderCalendar() {
  const grid = $('#calGrid');
  const title = $('#calTitle');
  if (!grid) return;

  const ym = state.ym || ymOf(new Date());
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const pad = (first.getDay() + 6) % 7;          // 周一为一周之始
  const total = new Date(y, m, 0).getDate();
  const todayStr = ymd(new Date());
  const marked = new Set(state.posts.map((p) => p.date).filter(Boolean));

  if (title) title.textContent = y + ' 年 ' + m + ' 月';

  const cells = [];
  for (let i = 0; i < pad; i++) cells.push('<span class="cal-cell is-blank"></span>');

  for (let d = 1; d <= total; d++) {
    const key = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const cls = ['cal-cell'];
    const has = marked.has(key);
    if (has) cls.push('has');
    if (key === todayStr) cls.push('is-today');
    if (key === state.day) cls.push('is-picked');
    cells.push(`<button class="${cls.join(' ')}" type="button" data-day="${key}"${has ? '' : ' tabindex="-1"'}>${d}</button>`);
  }

  grid.innerHTML = cells.join('');
  grid.querySelectorAll('.cal-cell.has').forEach((btn) => {
    btn.addEventListener('click', () => {
      const d = btn.dataset.day;
      state.day = state.day === d ? '' : d;
      renderCalendar();
      renderStream();
      if (state.day) {
        const stream = $('#grid');
        if (stream) window.scrollTo({ top: stream.getBoundingClientRect().top + window.scrollY - 130, behavior: 'smooth' });
      }
    });
  });
}

/* ---------------- 筛选 ---------------- */

function setMode(mode) {
  state.mode = mode;
  state.day = '';
  renderChips();
  renderStream();
}

function setTag(name) {
  state.tag = name;
  state.day = '';
  renderTags();
  renderStream();
}

function filtered() {
  const now = new Date();
  const thisMonth = ymOf(now);
  const q = state.q.trim().toLowerCase();

  return state.posts.filter((p) => {
    if (state.day && p.date !== state.day) return false;
    if (state.tag && !(p.tags || []).includes(state.tag)) return false;
    if (state.mode === 'week') {
      const d = parseDate(p.date);
      if ((now - d) / 86400000 > 7) return false;
    }
    if (state.mode === 'month' && String(p.date || '').slice(0, 7) !== thisMonth) return false;
    if (state.mode === 'photo' && !p.cover) return false;
    if (!q) return true;
    const hay = [p.title, p.excerpt, (p.tags || []).join(' '), p.place, p.mood, p.weather]
      .filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  });
}

const MODES = [
  { key: 'all', label: '全部' },
  { key: 'week', label: '最近七天' },
  { key: 'month', label: '本月' },
  { key: 'photo', label: '有照片' }
];

function renderChips() {
  const box = $('#chips');
  if (!box) return;
  box.innerHTML = MODES.map((m) => (
    `<button class="chip${m.key === state.mode ? ' is-on' : ''}" data-mode="${m.key}" type="button">${m.label}</button>`
  )).join('');
  box.querySelectorAll('.chip').forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode));
  });
}

function renderTags() {
  const list = $('#tagList');
  if (!list) return;
  const tags = allTags(state.posts);
  if (!tags.length) {
    list.innerHTML = '<li style="padding:6px 8px;font-size:12px;color:var(--ink-4)">还没有标签</li>';
    return;
  }
  list.innerHTML = tags.map((t) => (
    `<li><button class="${t.name === state.tag ? 'is-on' : ''}" data-tag="${escapeAttr(t.name)}" type="button">` +
    `<span class="dot"></span><span>${escapeHtml(t.name)}</span><span class="n">${t.count}</span></button></li>`
  )).join('');
  list.querySelectorAll('button').forEach((btn) => {
    btn.addEventListener('click', () => setTag(btn.dataset.tag === state.tag ? '' : btn.dataset.tag));
  });
}

/* ---------------- 文字流 ---------------- */

function entryEl(p) {
  const d = parseDate(p.date);
  const a = document.createElement('a');
  a.className = 'entry';
  a.href = './post.html?id=' + encodeURIComponent(p.id);

  const meta = [];
  if (p.mood) meta.push(`<span class="badge is-mood">${icon('mood')}${escapeHtml(p.mood)}</span>`);
  if (p.place) meta.push(`<span class="badge is-place">${icon('pin')}${escapeHtml(p.place)}</span>`);
  (p.tags || []).slice(0, 3).forEach((t) => {
    meta.push(`<span class="badge is-tag">#${escapeHtml(t)}</span>`);
  });

  a.innerHTML = `
    <div class="entry-day">
      <b>${String(d.getDate()).padStart(2, '0')}</b>
      <span>${WEEK[d.getDay()]}</span>
      ${p.weather ? `<span class="wx" title="${escapeAttr(p.weather)}">${weatherIcon(p.weather)}</span>` : ''}
    </div>
    <div class="entry-main">
      <div class="entry-top">
        <h2 class="entry-title">${escapeHtml(p.title || '无题')}</h2>
        ${p.time ? `<span class="entry-time">${escapeHtml(p.time)}</span>` : ''}
      </div>
      ${p.excerpt ? `<p class="entry-text">${escapeHtml(p.excerpt)}</p>` : ''}
      ${meta.length ? `<div class="entry-meta">${meta.join('')}</div>` : ''}
    </div>
    <span class="entry-arrow">${icon('arrow')}</span>`;
  return a;
}

function renderStream() {
  const grid = $('#grid');
  if (!grid) return;

  const list = filtered();
  grid.innerHTML = '';

  if (!list.length) {
    const hint = state.posts.length
      ? '换个过滤条件看看，或者清掉筛选回到全部'
      : '还没有写过。翻到第一页，写一句也算。';
    grid.innerHTML = `<div class="empty-state"><strong>这里空着</strong>${hint}</div>`;
    return;
  }

  const frag = document.createDocumentFragment();

  if (state.day) {
    const note = document.createElement('div');
    note.className = 'month-bar';
    note.style.position = 'static';
    note.innerHTML = `<b>${fmtDate(state.day)}</b><i>只看这一天</i>`;
    frag.appendChild(note);
  } else {
    // 按月分组
    const groups = [];
    let cur = null;
    list.forEach((p) => {
      const key = String(p.date || '').slice(0, 7);
      if (!cur || cur.key !== key) {
        cur = { key, items: [] };
        groups.push(cur);
      }
      cur.items.push(p);
    });

    let i = 0;
    groups.forEach((g) => {
      const [y, m] = g.key.split('-');
      const bar = document.createElement('div');
      bar.className = 'month-bar';
      bar.innerHTML = `<b>${y || ''} 年 ${Number(m) || ''} 月</b><i>${g.items.length} 篇</i>`;
      frag.appendChild(bar);

      g.items.forEach((p) => {
        const el = entryEl(p);
        el.style.animationDelay = Math.min(i * 24, 260) + 'ms';
        i++;
        frag.appendChild(el);
      });
    });

    grid.appendChild(frag);
    return;
  }

  list.forEach((p, i) => {
    const el = entryEl(p);
    el.style.animationDelay = Math.min(i * 24, 240) + 'ms';
    frag.appendChild(el);
  });
  grid.appendChild(frag);
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
      state.day = '';
      renderStream();
    });
  }

  const prev = $('#calPrev');
  const next = $('#calNext');
  const shift = (n) => {
    const ym = state.ym || ymOf(new Date());
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    state.ym = ymOf(d);
    renderCalendar();
  };
  if (prev) prev.addEventListener('click', () => shift(-1));
  if (next) next.addEventListener('click', () => shift(1));

  await gate(async () => {
    const tagParam = new URLSearchParams(location.search).get('tag');
    if (tagParam) state.tag = tagParam;

    try {
      const index = await loadIndex();
      state.posts = (index.posts || []).slice();
      state.ym = state.posts.length ? String(state.posts[0].date).slice(0, 7) : ymOf(new Date());

      renderStats();
      renderChips();
      renderTags();
      renderCalendar();
      renderStream();
    } catch (err) {
      const grid = $('#grid');
      if (grid) {
        grid.innerHTML = `<div class="empty-state"><strong>没能打开日记本</strong>${
          escapeHtml(err.message || '网络或配置出了点问题')
        }<br><br>可以刷新页面再试一次。</div>`;
      }
      toast('读取失败：' + (err.message || '未知错误'), { tone: 'bad' });
    }
  });
}

boot();
