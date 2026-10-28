/* 墨记 InkNote — 启动加载器
 *
 * 站点内容以密文形式存放在 assets/app.bin，只有输入正确的访问密码
 * 才能在浏览器里解密并运行。密码本身不会出现在仓库里。
 *
 * 解锁后可以选择「记住这台设备」，把派生密钥留在本机 localStorage，
 * 30 天内免输入；在应用里「立即锁定」会清除它。
 */

(function () {
  'use strict';

  var BIN_URL = './assets/app.bin';
  var STORE_KEY = 'inknote.access';
  var REMEMBER_DAYS = 30;
  var MIN_LEN = 1;

  var $ = function (sel) { return document.querySelector(sel); };
  var lockEl = null;
  var started = false;

  /* ------------------------------ 工具 ------------------------------ */

  function b64ToBuf(b64) {
    var bin = atob(b64);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  function bufToB64(buf) {
    var bytes = new Uint8Array(buf);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function readStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      if (!obj || !obj.k) return null;
      if (obj.exp && obj.exp < Date.now()) { localStorage.removeItem(STORE_KEY); return null; }
      return obj;
    } catch (e) { return null; }
  }

  function writeStore(kB64) {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        k: kB64,
        exp: Date.now() + REMEMBER_DAYS * 86400000
      }));
    } catch (e) { /* 隐私模式下可能写不进去，忽略 */ }
  }

  function clearStore() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  /* ------------------------------ 解密 ------------------------------ */

  async function importRawKey(kB64) {
    return crypto.subtle.importKey('raw', b64ToBuf(kB64), { name: 'AES-GCM' }, true, ['decrypt']);
  }

  async function deriveKey(password, saltB64, iter) {
    var enc = new TextEncoder();
    var base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64ToBuf(saltB64), iterations: iter, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      true,
      ['decrypt']
    );
  }

  async function openWith(key, bin) {
    var plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBuf(bin.iv), tagLength: 128 },
      key,
      concatCt(bin)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  // esbuild 输出的 ct 不含 tag，Web Crypto 要求 tag 拼在密文尾部
  function concatCt(bin) {
    var ct = new Uint8Array(b64ToBuf(bin.ct));
    var tag = new Uint8Array(b64ToBuf(bin.tag));
    var out = new Uint8Array(ct.length + tag.length);
    out.set(ct, 0);
    out.set(tag, ct.length);
    return out.buffer;
  }

  var binCache = null;
  async function loadBin() {
    if (binCache) return binCache;
    var res = await fetch(BIN_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('无法加载资源（HTTP ' + res.status + '）');
    var bin = await res.json();
    if (!bin || !bin.ct) throw new Error('资源格式不正确');
    binCache = bin;
    return bin;
  }

  /* ------------------------------ 启动应用 ------------------------------ */

  async function start(app) {
    if (started) return;
    started = true;

    var style = document.createElement('style');
    style.id = 'inknote-style';
    style.textContent = app.css;
    document.head.appendChild(style);

    var boot = $('#bootScreen');
    if (boot) {
      boot.classList.add('is-out');
      setTimeout(function () { boot.remove(); }, 340);
    }

    var url = URL.createObjectURL(new Blob([app.js], { type: 'text/javascript' }));
    try {
      await import(url);
    } catch (err) {
      console.error(err);
      showFatal('应用启动失败：' + (err && err.message ? err.message : err));
    } finally {
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    }
  }

  /* ------------------------------ 锁屏界面 ------------------------------ */

  function setMsg(text, tone) {
    var el = $('#bootMsg');
    if (!el) return;
    el.textContent = text || '';
    el.setAttribute('data-tone', tone || '');
  }

  function setBusy(busy) {
    var btn = $('#bootGo');
    var input = $('#bootPwd');
    if (btn) { btn.disabled = busy; btn.textContent = busy ? '解锁中…' : '进入墨记'; }
    if (input) input.disabled = busy;
  }

  function showFatal(text) {
    var form = $('#bootForm');
    if (form) form.hidden = true;
    setMsg(text, 'err');
    var btn = $('#bootRetry');
    if (btn) btn.hidden = false;
  }

  async function tryUnlock(password, remember) {
    setBusy(true);
    setMsg('正在解密…');
    try {
      var bin = await loadBin();
      var key = await deriveKey(password, bin.salt, bin.iter || 210000);
      var app;
      try {
        app = await openWith(key, bin);
      } catch (e) {
        setBusy(false);
        setMsg('访问密码不正确', 'err');
        var input = $('#bootPwd');
        if (input) { input.select(); input.focus(); }
        return;
      }
      if (remember) {
        var raw = await crypto.subtle.exportKey('raw', key);
        writeStore(bufToB64(raw));
      }
      await start(app);
    } catch (err) {
      setBusy(false);
      setMsg((err && err.message) || '加载失败，请检查网络后重试', 'err');
    }
  }

  async function boot() {
    lockEl = $('#bootScreen');
    if (!window.crypto || !crypto.subtle) {
      showFatal('当前环境不支持 Web Crypto，请通过 https 访问本站。');
      return;
    }

    var saved = readStore();
    if (saved) {
      // 记住过设备：直接用本机密钥解密，无需输入
      setBusy(true);
      setMsg('正在解锁…');
      try {
        var bin = await loadBin();
        var key = await importRawKey(saved.k);
        var app = await openWith(key, bin);
        await start(app);
        return;
      } catch (e) {
        // 密码被更换或密钥失效，回到输入密码
        clearStore();
        setBusy(false);
        setMsg('需要重新输入访问密码');
      }
    }

    var form = $('#bootForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var val = ($('#bootPwd') || {}).value || '';
        if (val.trim().length < MIN_LEN) { setMsg('请输入访问密码', 'err'); return; }
        tryUnlock(val, !!($('#bootRemember') || {}).checked);
      });
    }
    var pwd = $('#bootPwd');
    if (pwd) setTimeout(function () { pwd.focus(); }, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
