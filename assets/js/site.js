/* 公共层：主题、锁屏、轻提示、日期格式、页面通用行为 */

import { SITE } from './config.js';
import * as vault from './vault.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- 主题 ---------------- */

const THEME_KEY = 'sg.theme';

export function currentTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(t) {
  const theme = t || currentTheme();
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#17130d' : '#ece1c6');
  $$('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-label', theme === 'dark' ? '切换到浅色' : '切换到深色');
    btn.classList.toggle('is-dark', theme === 'dark');
  });
}

export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

export function bindThemeToggles() {
  $$('[data-theme-toggle]').forEach((btn) => btn.addEventListener('click', toggleTheme));
}

/* ---------------- 轻提示 ---------------- */

let toastTimer = null;

export function toast(message, { tone = 'ink', duration = 2600 } = {}) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.dataset.tone = tone;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), duration);
}

/* ---------------- 日期 ---------------- */

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function parseDate(str) {
  if (!str) return new Date();
  const d = new Date(String(str).length <= 10 ? str + 'T12:00:00' : str);
  return isNaN(d.getTime()) ? new Date() : d;
}

export function fmtDate(str) {
  const d = parseDate(str);
  return d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');
}

export function fmtDateLong(str) {
  const d = parseDate(str);
  return d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日 · ' + WEEK[d.getDay()];
}

export function todayInput() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function monthEn(str) {
  const d = parseDate(str);
  return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][d.getMonth()];
}

export function daysAgo(str) {
  const d = parseDate(str);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff <= 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff < 7) return diff + ' 天前';
  if (diff < 30) return Math.floor(diff / 7) + ' 周前';
  return fmtDate(str);
}

/* ---------------- 锁屏 ---------------- */

function lockMarkup() {
  return `
  <div class="lock-card">
    <div class="lock-seal" aria-hidden="true">拾</div>
    <p class="lock-kicker">${SITE.titleEn}</p>
    <h1 class="lock-title">拾光日记</h1>
    <p class="lock-sub">这里记着一些私人的日子，<br>需要密码才能翻开。</p>
    <form class="lock-form" id="lockForm" autocomplete="on">
      <div class="lock-field">
        <input id="lockPass" type="password" autocomplete="current-password" placeholder="日记密码" aria-label="访问密码">
        <button type="submit" id="lockGo">翻开</button>
      </div>
      <label class="lock-remember"><input type="checkbox" id="lockRemember" checked><span>这台设备记住 30 天</span></label>
      <p class="lock-msg" id="lockMsg" role="status"></p>
    </form>
    <p class="lock-foot">内容以密文存放，密码只在你手上。<br>忘记密码则无法恢复，请自己记牢。</p>
  </div>`;
}

function showLock() {
  let el = document.getElementById('lock');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lock';
    el.className = 'lock';
    el.innerHTML = lockMarkup();
    document.body.appendChild(el);
  }
  document.documentElement.classList.add('is-locked');
  document.body.classList.add('is-locked');

  const form = $('#lockForm', el);
  const input = $('#lockPass', el);
  const btn = $('#lockGo', el);
  const msg = $('#lockMsg', el);
  const remember = $('#lockRemember', el);

  setTimeout(() => input.focus(), 260);

  return new Promise((resolve, reject) => {
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const pass = input.value.trim();
      if (!pass) { msg.textContent = '请先输入密码'; return; }
      btn.disabled = true;
      btn.textContent = '正在翻开…';
      msg.textContent = '';
      el.classList.add('is-busy');
      try {
        await vault.unlock(pass, { remember: remember.checked });
        el.classList.add('is-done');
        setTimeout(() => {
          el.remove();
          document.documentElement.classList.remove('is-locked');
          document.body.classList.remove('is-locked');
        }, 420);
        resolve();
      } catch (err) {
        el.classList.remove('is-busy');
        btn.disabled = false;
        btn.textContent = '翻开';
        input.select();
        msg.textContent = err.message || '解锁失败';
        el.classList.add('is-wrong');
        setTimeout(() => el.classList.remove('is-wrong'), 520);
        if (!/密码|配置|网络/.test(err.message)) reject(err);
      }
    });
  });
}

/** 解锁闸门：已解锁则直接进入，否则显示锁屏 */
export async function gate(onReady) {
  applyTheme();
  const key = await vault.ensureKey();
  if (key) {
    document.documentElement.classList.remove('is-locked');
    document.body.classList.remove('is-locked');
    const el = document.getElementById('lock');
    if (el) el.remove();
    return onReady();
  }
  await showLock();
  return onReady();
}

export function bindLockButton() {
  $$('[data-lock]').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      vault.lock();
      location.reload();
    });
  });
}

/* ---------------- 杂项 ---------------- */

export function debounce(fn, wait = 200) {
  let t = null;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function isOnline() {
  return navigator.onLine !== false;
}

/* ---------------- Service Worker ---------------- */

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* 离线增强失败不影响阅读 */ });
  });
}

export { vault, SITE };
