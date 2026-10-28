/* 保险库：负责「用访问密码解锁 → 拿到内容密钥 CK → 加解密一切内容」。
   密码本身不保存在任何地方，只保存解锁后的 CK（可设定 30 天免输）。 */

import { SITE } from './config.js';
import {
  deriveKey, decryptJSON, encryptJSON, decryptBytes, encryptBytes,
  b64encode, b64decode, randomB64, randomBytes
} from './crypto.js';

const KEY_STORE = 'sg.session.v1';
const AAD = 'shiguang-ck-v1';
const AAD_CONTENT = 'shiguang-content-v1';
const REMEMBER_DAYS = 30;

let ckBytes = null;      // Uint8Array(32)
let ckKey = null;        // CryptoKey
let lockData = null;     // assets/lock.json

/* ---------- 会话 ---------- */

export function getSession() {
  try {
    const raw = localStorage.getItem(KEY_STORE);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !s.ck || !s.exp || Date.now() > s.exp) {
      localStorage.removeItem(KEY_STORE);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

function persist(remember) {
  if (!ckBytes) return;
  if (!remember) {
    sessionStorage.setItem(KEY_STORE + '.tmp', b64encode(ckBytes));
    localStorage.removeItem(KEY_STORE);
    return;
  }
  sessionStorage.removeItem(KEY_STORE + '.tmp');
  localStorage.setItem(KEY_STORE, JSON.stringify({
    v: 1,
    ck: b64encode(ckBytes),
    exp: Date.now() + REMEMBER_DAYS * 86400000
  }));
}

function restoreFromSessionStorage() {
  const tmp = sessionStorage.getItem(KEY_STORE + '.tmp');
  if (!tmp) return false;
  ckBytes = b64decode(tmp);
  return true;
}

export async function ensureKey() {
  if (ckKey) return ckKey;
  if (!ckBytes) {
    const s = getSession();
    if (s) ckBytes = b64decode(s.ck);
    else restoreFromSessionStorage();
  }
  if (!ckBytes) return null;
  ckKey = await crypto.subtle.importKey('raw', ckBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  return ckKey;
}

export function isUnlocked() {
  return !!ckKey || !!ckBytes || !!getSession() || !!sessionStorage.getItem(KEY_STORE + '.tmp');
}

export function lock() {
  ckBytes = null;
  ckKey = null;
  localStorage.removeItem(KEY_STORE);
  sessionStorage.removeItem(KEY_STORE + '.tmp');
}

/* ---------- 解锁 ---------- */

export async function loadLock(force = false) {
  if (lockData && !force) return lockData;
  const res = await fetch(SITE.paths.lock, { cache: 'no-store' });
  if (!res.ok) throw new Error('读取访问配置失败（' + res.status + '）');
  lockData = await res.json();
  return lockData;
}

export async function unlock(password, { remember = true } = {}) {
  const lock = await loadLock();
  if (!lock || !Array.isArray(lock.env) || !lock.env.length) throw new Error('访问配置不完整');
  const iter = lock.iter || 210000;

  for (const env of lock.env) {
    try {
      const kek = await deriveKey(password, env.salt, iter);
      const params = { name: 'AES-GCM', iv: b64decode(env.iv), additionalData: new TextEncoder().encode(AAD) };
      const raw = await crypto.subtle.decrypt(params, kek, b64decode(env.ct));
      ckBytes = new Uint8Array(raw);
      if (ckBytes.length !== 32) continue;
      ckKey = await crypto.subtle.importKey('raw', ckBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
      persist(remember);
      return true;
    } catch {
      /* 换下一个信封 */
    }
  }
  throw new Error('密码不对，或者网络把配置文件截断了');
}

export async function changePassword(newPassword, { remember = true } = {}) {
  const key = await ensureKey();
  if (!key) throw new Error('请先解锁');
  const salt = randomB64(16);
  const iv = randomBytes(12);
  const kek = await deriveKey(newPassword, salt);
  const params = { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(AAD) };
  const ct = await crypto.subtle.encrypt(params, kek, ckBytes);
  const lock = await loadLock();
  lock.env = [{
    salt,
    iv: b64encode(iv),
    ct: b64encode(new Uint8Array(ct))
  }];
  lock.updatedAt = new Date().toISOString();
  lockData = lock;
  persist(remember);
  return lock;
}

/* ---------- 内容加解密 ---------- */

export async function sealJSON(obj) {
  const key = await ensureKey();
  if (!key) throw new Error('尚未解锁');
  return encryptJSON(obj, key, AAD_CONTENT);
}

export async function openJSON(payload) {
  const key = await ensureKey();
  if (!key) throw new Error('尚未解锁');
  return decryptJSON(payload, key, AAD_CONTENT);
}

export async function sealBytes(bytes) {
  const key = await ensureKey();
  if (!key) throw new Error('尚未解锁');
  return encryptBytes(bytes, key);
}

export async function openBytes(buf) {
  const key = await ensureKey();
  if (!key) throw new Error('尚未解锁');
  return decryptBytes(buf, key);
}
