/* 墨记 InkNote — 构建脚本
 *
 * 作用：把 src/ 下的可读源码打包压缩，加密后输出单个 assets/app.bin。
 *       仓库里只提交这个密文文件，别人打开 GitHub 仓库看到的是一串无法阅读的密文。
 *
 * 密钥结构（v2）：
 *   随机生成一个内容密钥 CK（32 字节），用它加密整个应用包；
 *   每个访问密码只负责「包裹」CK —— PBKDF2 派生 KEK，AES-GCM 包住 CK。
 *   于是有多个密码时，应用包只加密一次；改密码也只需要重新包裹 CK。
 *
 * 用法：
 *   node tools/build.mjs --password 主密码
 *   node tools/build.mjs --password 主密码 --alt 旧密码1,旧密码2
 *   INKNOTE_PASSWORD=主密码 INKNOTE_ALT=旧密码 node tools/build.mjs
 *
 * --alt 里的密码同样能解锁，用途是「用旧密码重设新密码」。
 * 密码不会写进仓库，只用于加密 assets/app.bin。
 */

import { build, transform } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ITER = 210000;
const AAD = Buffer.from('inknote-ck-v2');
const MIN_LEN = 6;

function argValue(name) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--' + name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const pref = argv.find((a) => a.startsWith('--' + name + '='));
  return pref ? pref.slice(name.length + 3) : null;
}

const primary = argValue('password') || process.env.INKNOTE_PASSWORD;
if (!primary) {
  console.error('缺少访问密码。用法：node tools/build.mjs --password 你的密码 [--alt 旧密码]');
  console.error('（密码不会写进仓库，只用于加密 assets/app.bin）');
  process.exit(1);
}

const altRaw = argValue('alt') || process.env.INKNOTE_ALT || '';
const passwords = [primary, ...altRaw.split(',').map((s) => s.trim()).filter(Boolean)]
  .filter((p, i, arr) => arr.indexOf(p) === i); // 去重

for (const p of passwords) {
  if (p.length < MIN_LEN) {
    console.error('访问密码至少 ' + MIN_LEN + ' 位（当前：' + p.length + ' 位）');
    process.exit(1);
  }
}

/* ---------- 1. 打包 JavaScript ---------- */
const jsResult = await build({
  entryPoints: [path.join(ROOT, 'src/app.js')],
  bundle: true,
  minify: true,
  format: 'esm',
  target: ['es2020'],
  charset: 'utf8',
  legalComments: 'none',
  write: false,
  logLevel: 'warning'
});
const js = jsResult.outputFiles[0].text;

/* ---------- 2. 压缩 CSS ---------- */
const cssRaw = await fs.readFile(path.join(ROOT, 'src/app.css'), 'utf8');
const cssResult = await transform(cssRaw, { loader: 'css', minify: true, charset: 'utf8' });
const css = cssResult.code;

/* ---------- 3. 用随机内容密钥加密应用包 ---------- */
const contentKey = crypto.randomBytes(32);
const payload = JSON.stringify({ v: 2, js, css });
const iv = crypto.randomBytes(12);
const body = crypto.createCipheriv('aes-256-gcm', contentKey, iv);
const ct = Buffer.concat([body.update(payload, 'utf8'), body.final()]);
const tag = body.getAuthTag();

/* ---------- 4. 每个密码各包一份内容密钥 ---------- */
function envelope(password) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const kek = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
  const c = crypto.createCipheriv('aes-256-gcm', kek, iv);
  c.setAAD(AAD);
  const ct = Buffer.concat([c.update(contentKey), c.final()]);
  return {
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    tag: c.getAuthTag().toString('base64'),
    ct: ct.toString('base64')
  };
}

const bin = {
  v: 2,
  alg: 'AES-256-GCM',
  kdf: 'PBKDF2-SHA256',
  iter: ITER,
  aad: AAD.toString('utf8'),
  iv: iv.toString('base64'),
  tag: tag.toString('base64'),
  ct: ct.toString('base64'),
  env: passwords.map(envelope),
  builtAt: new Date().toISOString()
};

const outPath = path.join(ROOT, 'assets/app.bin');
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(bin));

const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log('打包完成');
console.log('  JavaScript  ' + kb(Buffer.byteLength(js)));
console.log('  CSS         ' + kb(Buffer.byteLength(css)));
console.log('  密文输出    ' + kb(Buffer.byteLength(JSON.stringify(bin))) + '  → assets/app.bin');
console.log('  访问密码    ' + passwords.length + ' 组（主密码长度 ' + primary.length + ' 位，其余作为旧密码）');
