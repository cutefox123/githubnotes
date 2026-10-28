/* 墨记 InkNote — 构建脚本
 *
 * 作用：把 src/ 下的可读源码打包压缩，再用访问密码派生的密钥加密，
 *       输出单个 assets/app.bin。仓库里只提交这个密文文件，
 *       所以别人打开 GitHub 仓库看到的是一串无法阅读的密文。
 *
 * 用法：
 *   node tools/build.mjs --password 你的访问密码
 *   INKNOTE_PASSWORD=你的访问密码 node tools/build.mjs
 *
 * 改密码 = 换一个 --password 重新构建 + 重新推送，旧密码立即失效。
 */

import { build, transform } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ITER = 210000;

function argValue(name) {
  const argv = process.argv.slice(2);
  const i = argv.indexOf('--' + name);
  if (i >= 0 && argv[i + 1]) return argv[i + 1];
  const pref = argv.find((a) => a.startsWith('--' + name + '='));
  return pref ? pref.slice(name.length + 3) : null;
}

const password = argValue('password') || process.env.INKNOTE_PASSWORD;
if (!password) {
  console.error('缺少访问密码。用法：node tools/build.mjs --password 你的密码');
  console.error('（密码不会写进仓库，只用于加密 assets/app.bin）');
  process.exit(1);
}
if (password.length < 6) {
  console.error('访问密码至少 6 位');
  process.exit(1);
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

/* ---------- 3. 加密 ---------- */
const payload = JSON.stringify({ v: 1, js, css });
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);
const key = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
const ct = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();

const bin = {
  v: 1,
  alg: 'AES-256-GCM',
  kdf: 'PBKDF2-SHA256',
  iter: ITER,
  salt: salt.toString('base64'),
  iv: iv.toString('base64'),
  tag: tag.toString('base64'),
  ct: ct.toString('base64'),
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
console.log('  访问密码    已设置（长度 ' + password.length + ' 位）');
