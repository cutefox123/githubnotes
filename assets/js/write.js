/* 写作页：在本机加密 → 通过 GitHub API 提交密文 → 等 Pages 生效 */

import { SITE, MOODS, WEATHERS } from './config.js';
import { gate, applyTheme, bindThemeToggles, bindLockButton, toast, $, $$, todayInput } from './site.js';
import * as vault from './vault.js';
import * as gh from './api.js';
import { loadPost } from './data.js';
import { renderMarkdown, stripMarkdown } from './md.js';

const DRAFT_KEY = 'sg.draft.v1';
const params = new URLSearchParams(location.search);
const editId = params.get('id') || '';

const state = {
  cover: null,        // { thumb: Uint8Array, full: Uint8Array, previewUrl: string }
  coverPath: '',      // 编辑时保留的原封面
  coverFullPath: '',
  existing: null,
  weather: '',
  mood: '',
  busy: false,
  login: ''
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- 启动 ---------------- */

async function boot() {
  applyTheme();
  bindThemeToggles();
  bindLockButton();
  await gate(init);
}

async function init() {
  bindForm();
  if (editId) {
    $('#pageTitle').textContent = '改一篇';
    $('#pageSub').textContent = '改完点更新，几秒后生效。';
  }

  const token = gh.getToken();
  if (!token) {
    showGate();
    return;
  }
  setStatus('checking', '正在验证令牌…');
  try {
    const user = await gh.verify();
    state.login = user && user.login ? user.login : '';
    setStatus('ok', '已连接' + (state.login ? ' @' + state.login : ''));
    showEditor();
    await afterConnect();
  } catch (err) {
    if (err.status === 401) {
      gh.setToken('');
      setStatus('bad', '令牌失效了');
      showGate('令牌无效或已过期，请重新生成一个。');
    } else {
      setStatus('bad', '连不上 GitHub');
      showGate('网络没能连上 GitHub（' + (err.message || '未知错误') + '），可以稍后重试。');
    }
  }
}

function setStatus(kind, text) {
  const dot = $('#statusDot');
  dot.className = 'status-dot' + (kind === 'ok' ? ' ok' : kind === 'bad' ? ' bad' : '');
  $('#statusText').textContent = text;
}

function showGate(message) {
  $('#tokenGate').hidden = false;
  $('#editor').hidden = true;
  if (message) $('#tokenMsg').textContent = message;
  const input = $('#tokenInput');
  if (input) setTimeout(() => input.focus(), 200);
}

function showEditor() {
  $('#tokenGate').hidden = true;
  $('#editor').hidden = false;
  const info = $('#tokenInfo');
  if (info) info.textContent = '当前连接：' + (state.login ? '@' + state.login : SITE.repo.owner) +
    ' / ' + SITE.repo.name;
}

async function afterConnect() {
  if (editId) {
    await loadForEdit(editId);
  } else {
    restoreDraft();
  }
}

/* ---------------- 表单 ---------------- */

function bindForm() {
  const weatherBox = $('#weatherChips');
  weatherBox.innerHTML = WEATHERS.map((w) => `<button type="button" data-v="${w}">${w}</button>`).join('');
  const moodBox = $('#moodChips');
  moodBox.innerHTML = MOODS.map((m) => `<button type="button" data-v="${m}">${m}</button>`).join('');

  weatherBox.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.weather = state.weather === btn.dataset.v ? '' : btn.dataset.v;
    syncChips(weatherBox, state.weather);
  });
  moodBox.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.mood = state.mood === btn.dataset.v ? '' : btn.dataset.v;
    syncChips(moodBox, state.mood);
  });

  $('#tabWrite').addEventListener('click', () => switchTab('write'));
  $('#tabPreview').addEventListener('click', () => switchTab('preview'));

  // 封面
  $('#coverDrop').addEventListener('click', () => $('#coverFile').click());
  $('#coverFile').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) handleCover(f);
  });
  $('#coverRemove').addEventListener('click', () => {
    state.cover = null;
    state.coverPath = '';
    state.coverFullPath = '';
    $('#coverPreview').hidden = true;
    $('#coverEmpty').hidden = false;
    $('#coverFile').value = '';
  });

  ['#fTitle', '#fBody', '#fPlace', '#fTags', '#fExcerpt', '#fDate'].forEach((sel) => {
    const el = $(sel);
    el.addEventListener('input', scheduleDraft);
    el.addEventListener('change', scheduleDraft);
  });

  $('#publishBtn').addEventListener('click', publish);
  $('#draftBtn').addEventListener('click', () => {
    saveDraft(true);
  });
  $('#clearBtn').addEventListener('click', () => {
    if (!confirm('清空当前内容？草稿也会一起清掉。')) return;
    localStorage.removeItem(DRAFT_KEY);
    location.href = editId ? './post.html?id=' + encodeURIComponent(editId) : './write.html';
  });
  $('#tokenSave').addEventListener('click', connect);
  $('#tokenInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); connect(); }
  });
  $('#tokenForget').addEventListener('click', () => {
    if (!confirm('断开后需要重新粘贴令牌才能发布，确定吗？')) return;
    gh.setToken('');
    setStatus('bad', '已断开');
    showGate('已忘掉这台设备的令牌。');
  });

  $('#fDate').value = todayInput();

  // 键盘：⌘/Ctrl + Enter 发布
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      publish();
    }
  });
}

function syncChips(box, value) {
  $$('button', box).forEach((b) => b.classList.toggle('is-on', b.dataset.v === value));
}

function switchTab(which) {
  const isPreview = which === 'preview';
  $('#tabWrite').classList.toggle('is-on', !isPreview);
  $('#tabPreview').classList.toggle('is-on', isPreview);
  $('#fBody').hidden = isPreview;
  $('#previewPane').hidden = !isPreview;
  if (isPreview) {
    $('#previewPane').innerHTML = renderMarkdown($('#fBody').value || '');
  }
}

async function connect() {
  const input = $('#tokenInput');
  const raw = input.value.trim();
  const msg = $('#tokenMsg');
  if (!raw) { msg.textContent = '先把令牌粘进来'; return; }
  if (!/^(github_pat_|ghp_|gho_|ghu_|ghs_|ghr_)/.test(raw)) {
    msg.textContent = '这串看起来不像 GitHub 令牌（应以 github_pat_ 或 ghp_ 开头）';
    return;
  }
  $('#tokenSave').disabled = true;
  msg.textContent = '正在验证…';
  gh.setToken(raw);
  try {
    const user = await gh.verify();
    state.login = user.login || '';
    msg.textContent = '好了，欢迎 ' + state.login;
    setStatus('ok', '已连接 @' + state.login);
    showEditor();
    await afterConnect();
    toast('连接成功，可以开始写了');
  } catch (err) {
    gh.setToken('');
    msg.textContent = err.status === 401 ? '令牌被 GitHub 拒绝了，检查一下权限和复制是否完整' :
      '连不上：' + (err.message || '网络问题');
    setStatus('bad', '未连接');
  } finally {
    $('#tokenSave').disabled = false;
  }
}

/* ---------------- 封面 ---------------- */

async function handleCover(file) {
  if (!file.type.startsWith('image/')) {
    toast('这不是图片文件', { tone: 'bad' });
    return;
  }
  toast('正在压缩图片…');
  try {
    const compressed = await compress(file);
    state.cover = compressed;
    state.coverPath = '';
    state.coverFullPath = '';
    const img = $('#coverImg');
    img.src = compressed.previewUrl;
    $('#coverPreview').hidden = false;
    $('#coverEmpty').hidden = true;
    toast('封面准备好了');
  } catch (err) {
    toast('这张图处理不了（HEIC 格式建议先转成 JPG）', { tone: 'bad' });
  }
}

async function compress(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    bitmap = await bitmapFromImg(file);
  }
  const make = (maxW, quality) => {
    const scale = Math.min(1, maxW / Math.max(bitmap.width, 1));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('压缩失败'))), 'image/jpeg', quality);
    });
  };
  const thumb = await make(760, 0.78);
  const full = await make(1600, 0.86);
  return {
    thumb: new Uint8Array(await thumb.arrayBuffer()),
    thumbB64: gh.bytesToB64(new Uint8Array(await thumb.arrayBuffer())),
    full: new Uint8Array(await full.arrayBuffer()),
    fullB64: gh.bytesToB64(new Uint8Array(await full.arrayBuffer())),
    previewUrl: URL.createObjectURL(full)
  };
}

function bitmapFromImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法解码')); };
    img.src = url;
  });
}

function hhmm(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* ---------------- 草稿 ---------------- */

let draftTimer = null;
function scheduleDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => saveDraft(false), 1200);
}

function collect() {
  return {
    title: $('#fTitle').value.trim(),
    date: $('#fDate').value || todayInput(),
    place: $('#fPlace').value.trim(),
    weather: state.weather,
    mood: state.mood,
    tags: parseTags($('#fTags').value),
    body: $('#fBody').value,
    excerpt: $('#fExcerpt').value.trim(),
    at: Date.now()
  };
}

function saveDraft(manual) {
  if (editId) { if (manual) toast('修改中的日记不用存草稿，直接点更新'); return; }
  const data = collect();
  if (!data.title && !data.body) {
    if (manual) toast('还什么都没写呢');
    return;
  }
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    if (manual) toast('草稿存好了，下次打开会自动带出来');
  } catch {
    if (manual) toast('草稿存不下了（浏览器空间不足）', { tone: 'bad' });
  }
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    if (!d || (!d.title && !d.body)) return;
    fillForm(d);
    toast('已带出上次没写完的草稿');
  } catch { /* 忽略 */ }
}

function fillForm(d) {
  $('#fTitle').value = d.title || '';
  $('#fDate').value = d.date || todayInput();
  $('#fPlace').value = d.place || '';
  $('#fTags').value = (d.tags || []).join(', ');
  $('#fBody').value = d.body || '';
  $('#fExcerpt').value = d.excerpt || '';
  state.weather = d.weather || '';
  state.mood = d.mood || '';
  syncChips($('#weatherChips'), state.weather);
  syncChips($('#moodChips'), state.mood);
}

/* ---------------- 编辑 ---------------- */

async function loadForEdit(id) {
  $('#pubMsg').textContent = '正在打开这篇…';
  try {
    const post = await loadPost(id);
    state.existing = post;
    state.coverPath = post.cover || '';
    state.coverFullPath = post.coverFull || '';
    fillForm({
      title: post.title,
      date: post.date,
      place: post.place,
      weather: post.weather,
      mood: post.mood,
      tags: post.tags,
      body: post.body,
      excerpt: post.excerpt
    });
    if (state.coverPath) {
      $('#coverPreview').hidden = false;
      $('#coverEmpty').hidden = true;
      try {
        const url = await (await import('./data.js')).loadImage(state.coverFullPath || state.coverPath);
        $('#coverImg').src = url;
      } catch { /* 图挂了也不影响文字 */ }
    }
    $('#publishBtn').textContent = '更新';
    addDeleteButton();
    $('#pubMsg').textContent = '正在编辑：' + (post.title || '');
  } catch (err) {
    toast('没能打开这篇：' + (err.message || ''), { tone: 'bad' });
    $('#pubMsg').textContent = '读取失败，可能是链接过期了。';
  }
}

function addDeleteButton() {
  if (document.getElementById('deleteBtn')) return;
  const btn = document.createElement('button');
  btn.className = 'btn plain';
  btn.id = 'deleteBtn';
  btn.type = 'button';
  btn.textContent = '删除这篇';
  btn.style.color = 'var(--accent)';
  btn.addEventListener('click', deletePost);
  $('.pub-bar').appendChild(btn);
}

async function deletePost() {
  const post = state.existing;
  if (!post) return;
  if (!confirm('确定删掉《' + (post.title || '无题') + '》？删除后无法恢复。')) return;
  state.busy = true;
  const msg = $('#pubMsg');
  try {
    msg.textContent = '正在更新目录…';
    const bound = await readIndexBound();
    const index = bound.index;
    index.posts = index.posts.filter((p) => p.id !== post.id);
    index.updatedAt = new Date().toISOString();
    await saveIndex(index, bound.sha, '删除：' + (post.title || post.id));

    msg.textContent = '正在删除文件…';
    await removeRemote('posts/' + post.id + '.json', '删除正文 ' + post.id);
    if (post.cover) await removeRemote(post.cover, '删除封面 ' + post.id).catch(() => {});
    if (post.coverFull) await removeRemote(post.coverFull, '删除封面 ' + post.id).catch(() => {});

    localStorage.removeItem(DRAFT_KEY);
    toast('已删除');
    setTimeout(() => { location.href = './index.html'; }, 900);
  } catch (err) {
    toast('删除失败：' + (err.message || ''), { tone: 'bad' });
    msg.textContent = '删除失败：' + (err.message || '');
  } finally {
    state.busy = false;
  }
}

async function removeRemote(path, message) {
  const f = await gh.readFile(SITE.repo, path);
  if (!f) return;
  await gh.deleteFile(SITE.repo, path, { message, sha: f.sha });
}

/* ---------------- 发布 ---------------- */

function parseTags(raw) {
  return String(raw || '')
    .split(/[,，、\s]+/)
    .map((t) => t.replace(/^#/, '').trim())
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, 4);
}

function makeId(dateStr, posts) {
  const base = String(dateStr || todayInput()).replace(/-/g, '');
  let n = 1;
  const used = new Set((posts || []).map((p) => p.id));
  while (used.has(base + '-' + String(n).padStart(2, '0'))) n++;
  return base + '-' + String(n).padStart(2, '0');
}

async function publish() {
  if (state.busy) return;
  const msg = $('#pubMsg');
  const data = collect();
  if (!data.title) { toast('先给这篇起个名字', { tone: 'bad' }); $('#fTitle').focus(); return; }
  if (!data.body.trim()) { toast('正文还是空的', { tone: 'bad' }); $('#fBody').focus(); return; }

  state.busy = true;
  const btn = $('#publishBtn');
  btn.disabled = true;
  const oldLabel = btn.textContent;
  btn.textContent = '正在发布…';

  try {
    msg.textContent = '① 读取现有目录…';
    const bound = await readIndexBound();
    const index = bound.index;
    const isNew = !editId;
    const id = isNew ? makeId(data.date, index.posts) : editId;

    let coverPath = state.coverPath;
    let coverFullPath = state.coverFullPath;
    let coverBytes = null;

    if (state.cover) {
      msg.textContent = '② 加密封面…';
      coverPath = 'media/' + id + '-t.bin';
      coverFullPath = 'media/' + id + '-f.bin';
      const t = await vault.sealBytes(state.cover.thumb);
      const f = await vault.sealBytes(state.cover.full);
      coverBytes = { thumb: gh.bytesToB64(t), full: gh.bytesToB64(f) };
    }

    const now = new Date().toISOString();
    const post = {
      id,
      title: data.title,
      date: data.date,
      weather: data.weather || '',
      mood: data.mood || '',
      place: data.place || '',
      tags: data.tags,
      excerpt: data.excerpt || autoExcerpt(data.body),
      body: data.body,
      cover: coverPath || '',
      coverFull: coverFullPath || '',
      createdAt: (state.existing && state.existing.createdAt) || now,
      updatedAt: now,
      time: (state.existing && state.existing.time) || hhmm(now)
    };

    if (coverBytes) {
      msg.textContent = '③ 上传封面（1/2）…';
      await gh.writeFile(SITE.repo, post.cover, {
        base64: coverBytes.thumb, message: '封面 ' + id + '（小图）'
      });
      msg.textContent = '③ 上传封面（2/2）…';
      await gh.writeFile(SITE.repo, post.coverFull, {
        base64: coverBytes.full, message: '封面 ' + id + '（大图）'
      });
    }

    msg.textContent = '④ 加密正文并上传…';
    const sealed = await vault.sealJSON(post);
    const existingPost = await gh.readFile(SITE.repo, 'posts/' + id + '.json');
    await gh.writeFile(SITE.repo, 'posts/' + id + '.json', {
      text: JSON.stringify(sealed),
      message: (isNew ? '新日记：' : '更新：') + post.title,
      sha: existingPost ? existingPost.sha : undefined
    });

    msg.textContent = '⑤ 更新目录…';
    const card = {
      id: post.id,
      title: post.title,
      date: post.date,
      weather: post.weather,
      mood: post.mood,
      place: post.place,
      tags: post.tags,
      excerpt: post.excerpt,
      time: post.time,
      reading: Math.max(1, Math.round(String(post.body || '').length / 320)),
      cover: post.cover,
      coverFull: post.coverFull,
      updatedAt: post.updatedAt
    };
    index.posts = index.posts.filter((p) => p.id !== id);
    index.posts.push(card);
    index.posts.sort((a, b) => String(b.date).localeCompare(String(a.date)) ||
      String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    index.updatedAt = post.updatedAt;

    await saveIndex(index, bound.sha, (isNew ? '目录：' : '目录更新：') + post.title);

    localStorage.removeItem(DRAFT_KEY);
    msg.textContent = '⑥ 等 GitHub Pages 刷新…';
    const live = await waitForLive(id);
    if (live) {
      msg.textContent = '已发布，正在打开…';
      location.href = './post.html?id=' + encodeURIComponent(id) + '&fresh=' + Date.now();
      return;
    }
    msg.textContent = '已提交，但首页还没刷新完（通常 1 分钟内）。';
    toast('已发布，稍等片刻就能看到');
    btn.disabled = false;
    btn.textContent = isNew ? '再发一次' : '更新';
    if (isNew) {
      $('#publishBtn').onclick = () => {
        location.href = './post.html?id=' + encodeURIComponent(id);
      };
    }
    return;
  } catch (err) {
    console.error(err);
    msg.textContent = '发布失败：' + (err.message || '未知错误');
    toast('发布失败：' + (err.message || ''), { tone: 'bad' });
    btn.disabled = false;
    btn.textContent = oldLabel;
  } finally {
    state.busy = false;
    if (btn.textContent === '正在发布…') {
      btn.disabled = false;
      btn.textContent = oldLabel;
    }
  }
}

function autoExcerpt(body) {
  const t = stripMarkdown(body).replace(/\s+/g, ' ').trim();
  return t.length > 88 ? t.slice(0, 88) + '…' : t;
}

async function readIndexBound() {
  const f = await gh.readFile(SITE.repo, SITE.paths.index, SITE.repo.branch);
  if (!f) return { sha: null, index: { v: 1, updatedAt: '', site: {}, posts: [] } };
  const text = new TextDecoder().decode(gh.b64ToBytes(f.base64));
  const payload = JSON.parse(text);
  const index = await vault.openJSON(payload);
  if (!Array.isArray(index.posts)) index.posts = [];
  return { sha: f.sha, index };
}

async function saveIndex(index, sha, message) {
  const payload = await vault.sealJSON(index);
  await gh.writeFile(SITE.repo, SITE.paths.index, {
    text: JSON.stringify(payload),
    message,
    sha: sha || undefined
  });
}

async function waitForLive(id) {
  for (let i = 0; i < 14; i++) {
    await sleep(4000);
    try {
      const res = await fetch('posts/' + id + '.json?probe=' + Date.now(), { cache: 'no-store' });
      if (res.ok) return true;
    } catch { /* 继续等 */ }
  }
  return false;
}

boot();
