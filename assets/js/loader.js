/* 墨记 InkNote — 启动加载器
 *
 * 站点内容以密文形式存放在 assets/app.bin，只有输入正确的访问密码
 * 才能在浏览器里解密并运行。密码本身不会出现在仓库里。
 *
 * 密钥结构（与 tools/build.mjs 对应）：
 *   app.bin.ct  = 用随机内容密钥 CK 加密的整个应用包
 *   app.bin.env = 若干份「密码包裹的 CK」，每个可用密码一份
 * 所以：
 *   - 多个密码（主密码 + 旧密码）都能解锁；
 *   - 重设密码只需重新包裹 CK，不必重新加密整个应用包；
 *   - 本机重设后的封套存在 localStorage，下次直接用新密码进入。
 *
 * 解锁后可以选择「记住这台设备」，把 CK 留在本机 localStorage，
 * 30 天内免输入；在应用里「立即锁定」会清除它。
 */

(function () {
  'use strict';

  var BIN_URL = './assets/app.bin';
  var STORE_KEY = 'inknote.access';
  var ENV_KEY = 'inknote.env';
  var REMEMBER_DAYS = 30;
  var MIN_LEN = 1;
  var MIN_RESET_LEN = 6;
  var AAD_TEXT = 'inknote-ck-v2';

  var $ = function (sel) { return document.querySelector(sel); };
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

  function readLocalEnv() {
    try {
      var raw = localStorage.getItem(ENV_KEY);
      if (!raw) return null;
      var obj = JSON.parse(raw);
      return obj && obj.ct && obj.salt ? obj : null;
    } catch (e) { return null; }
  }

  function writeLocalEnv(env) {
    try { localStorage.setItem(ENV_KEY, JSON.stringify(env)); } catch (e) {}
  }

  /* ------------------------------ 解密 ------------------------------ */

  async function deriveKey(password, saltB64, iter, usage) {
    var enc = new TextEncoder();
    var base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64ToBuf(saltB64), iterations: iter, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      true,
      [usage]
    );
  }

  // esbuild 输出的 ct 不含 tag，Web Crypto 要求 tag 拼在密文尾部
  function concatCt(obj) {
    var ct = new Uint8Array(b64ToBuf(obj.ct));
    var tag = new Uint8Array(b64ToBuf(obj.tag));
    var out = new Uint8Array(ct.length + tag.length);
    out.set(ct, 0);
    out.set(tag, ct.length);
    return out.buffer;
  }

  // 用密码拆开一份封套，拿到内容密钥 CK
  async function openEnvelope(password, env, iter) {
    var kek = await deriveKey(password, env.salt, iter || 210000, 'decrypt');
    return crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBuf(env.iv), additionalData: new TextEncoder().encode(AAD_TEXT), tagLength: 128 },
      kek,
      concatCt(env)
    );
  }

  // 用新密码把 CK 重新包一份
  async function sealEnvelope(password, ck, iter) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var saltB64 = bufToB64(salt.buffer);
    var kek = await deriveKey(password, saltB64, iter || 210000, 'encrypt');
    var ctWithTag = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv, additionalData: new TextEncoder().encode(AAD_TEXT), tagLength: 128 },
      kek,
      ck
    );
    var all = new Uint8Array(ctWithTag);
    var body = all.slice(0, all.length - 16);
    var tag = all.slice(all.length - 16);
    return {
      salt: saltB64,
      iv: bufToB64(iv.buffer),
      tag: bufToB64(tag.buffer),
      ct: bufToB64(body.buffer)
    };
  }

  async function decryptPayload(ckRaw, bin) {
    var ck = await crypto.subtle.importKey('raw', ckRaw, { name: 'AES-GCM' }, false, ['decrypt']);
    var plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBuf(bin.iv), tagLength: 128 },
      ck,
      concatCt(bin)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }

  var binCache = null;
  async function loadBin() {
    if (binCache) return binCache;
    var res = await fetch(BIN_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('无法加载资源（HTTP ' + res.status + '）');
    var bin = await res.json();
    if (!bin || !bin.ct) throw new Error('资源格式不正确');
    // 兼容 v1：单个 salt 等同于只有一个封套
    if (!bin.env && bin.salt) bin.env = [{ salt: bin.salt, iv: bin.iv, tag: bin.tag, ct: bin.ct }];
    binCache = bin;
    return bin;
  }

  // 依次尝试：本机重设的封套 → 内嵌的各个密码封套
  async function findKey(password, bin) {
    var candidates = [];
    var local = readLocalEnv();
    if (local) candidates.push(local);
    candidates = candidates.concat(bin.env || []);
    for (var i = 0; i < candidates.length; i++) {
      try {
        var ck = await openEnvelope(password, candidates[i], bin.iter || 210000);
        await decryptPayload(ck, bin); // 确认这把 CK 真的能解当前应用包
        return ck;
      } catch (e) { /* 这份封套不匹配，继续试下一份 */ }
    }
    return null;
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
    var reset = $('#bootReset');
    if (reset) reset.hidden = true;
    setMsg(text, 'err');
    var btn = $('#bootRetry');
    if (btn) btn.hidden = false;
  }

  async function tryUnlock(password, remember) {
    setBusy(true);
    setMsg('正在解密…');
    try {
      var bin = await loadBin();
      var ck = await findKey(password, bin);
      if (!ck) {
        setBusy(false);
        setMsg('访问密码不正确', 'err');
        var input = $('#bootPwd');
        if (input) { input.select(); input.focus(); }
        return;
      }
      if (remember) writeStore(bufToB64(ck));
      await start(await decryptPayload(ck, bin));
    } catch (err) {
      setBusy(false);
      setMsg((err && err.message) || '加载失败，请检查网络后重试', 'err');
    }
  }

  /* ------------------------------ 重设密码 ------------------------------ */

  function downloadBin(bin) {
    var blob = new Blob([JSON.stringify(bin)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'app.bin';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  async function doReset() {
    var oldPwd = ($('#rsOld') || {}).value || '';
    var newPwd = ($('#rsNew') || {}).value || '';
    var again = ($('#rsNew2') || {}).value || '';
    if (!oldPwd) { setMsg('请输入当前访问密码', 'err'); return; }
    if (newPwd.length < MIN_RESET_LEN) { setMsg('新密码至少 ' + MIN_RESET_LEN + ' 位', 'err'); return; }
    if (newPwd !== again) { setMsg('两次输入的新密码不一致', 'err'); return; }

    var btn = $('#rsGo');
    if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
    setMsg('正在验证当前密码…');
    try {
      var bin = await loadBin();
      var ck = await findKey(oldPwd, bin);
      if (!ck) {
        setMsg('当前密码不正确', 'err');
        return;
      }
      setMsg('正在生成新的加密包…');
      var env = await sealEnvelope(newPwd, ck, bin.iter || 210000);
      var next = {};
      for (var k in bin) { if (Object.prototype.hasOwnProperty.call(bin, k)) next[k] = bin[k]; }
      next.v = 2;
      next.env = [env];
      next.rotatedAt = new Date().toISOString();

      // 本机立刻改用新密码：写一份本地封套，并清掉旧的免密缓存
      writeLocalEnv(env);
      clearStore();
      downloadBin(next);

      setMsg('新密码已在这台设备生效。要让所有设备都换，把下载的 app.bin 替换到仓库后推送。', 'ok');
      setTimeout(function () {
        var form = $('#bootResetForm');
        if (form) form.hidden = true;
        var f = $('#bootForm');
        if (f) f.hidden = false;
        var lk = $('#bootReset');
        if (lk) lk.hidden = false;
        var p = $('#bootPwd');
        if (p) { p.value = ''; p.focus(); }
      }, 3200);
    } catch (err) {
      setMsg((err && err.message) || '重设失败，请重试', 'err');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '生成新的加密包'; }
    }
  }

  function bindReset() {
    var link = $('#bootReset');
    var form = $('#bootResetForm');
    if (!link || !form) return;
    link.addEventListener('click', function () {
      var f = $('#bootForm');
      if (f) f.hidden = true;
      link.hidden = true;
      form.hidden = false;
      setMsg('');
      var first = $('#rsOld');
      if (first) first.focus();
    });
    var back = $('#rsBack');
    if (back) back.addEventListener('click', function () {
      form.hidden = true;
      link.hidden = false;
      var f = $('#bootForm');
      if (f) f.hidden = false;
      setMsg('');
      var first = $('#bootPwd');
      if (first) first.focus();
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      doReset();
    });
  }

  /* ------------------------------ 入口 ------------------------------ */

  async function boot() {
    if (!window.crypto || !crypto.subtle) {
      showFatal('当前环境不支持 Web Crypto，请通过 https 访问本站。');
      return;
    }

    var saved = readStore();
    if (saved) {
      // 记住过设备：直接用本机内容密钥解密，无需输入
      setBusy(true);
      setMsg('正在解锁…');
      try {
        var bin = await loadBin();
        var app = await decryptPayload(b64ToBuf(saved.k), bin);
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
    bindReset();
    var pwd = $('#bootPwd');
    if (pwd) setTimeout(function () { pwd.focus(); }, 120);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
