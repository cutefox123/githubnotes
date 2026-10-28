/* 加解密工具：PBKDF2 派生密钥 + AES-256-GCM，全部在本机浏览器里完成。
   服务器（GitHub）上只存在密文。 */

const te = new TextEncoder();
const td = new TextDecoder();

export const ITERATIONS = 210000;

export function hasWebCrypto() {
  return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.importKey);
}

export function b64encode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

export function b64decode(str) {
  const bin = atob(String(str || '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function randomBytes(len = 16) {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return buf;
}

export function randomB64(len = 16) {
  return b64encode(randomBytes(len));
}

export async function deriveKey(passphrase, saltB64, iterations = ITERATIONS) {
  if (!hasWebCrypto()) throw new Error('当前环境不支持 WebCrypto，请通过 https 或 localhost 打开');
  const baseKey = await crypto.subtle.importKey('raw', te.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: b64decode(saltB64), iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/* ---------- 文本 / JSON ---------- */

export async function encryptText(text, key, aad) {
  const iv = randomBytes(12);
  const params = { name: 'AES-GCM', iv };
  if (aad) params.additionalData = te.encode(aad);
  const ct = await crypto.subtle.encrypt(params, key, te.encode(text));
  return { iv: b64encode(iv), ct: b64encode(ct) };
}

export async function decryptText(payload, key, aad) {
  if (!payload || !payload.iv || !payload.ct) throw new Error('密文格式不对');
  const params = { name: 'AES-GCM', iv: b64decode(payload.iv) };
  if (aad) params.additionalData = te.encode(aad);
  const plain = await crypto.subtle.decrypt(params, key, b64decode(payload.ct));
  return td.decode(plain);
}

export async function encryptJSON(obj, key, aad) {
  return encryptText(JSON.stringify(obj), key, aad);
}

export async function decryptJSON(payload, key, aad) {
  return JSON.parse(await decryptText(payload, key, aad));
}

/* ---------- 二进制（封面图） ---------- */

/** 输出格式：iv(12) || 密文（含 GCM tag） */
export async function encryptBytes(bytes, key) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

export async function decryptBytes(buf, key) {
  const all = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (all.length < 13) throw new Error('图片密文不完整');
  const iv = all.subarray(0, 12);
  const ct = all.subarray(12);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct));
}

export function bytesToBase64(bytes) {
  return b64encode(bytes);
}
