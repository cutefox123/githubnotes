/* 初始化保险库：生成随机内容密钥 CK，用访问密码包一层，写出 assets/lock.json。
 *
 * 用法：node tools/init-vault.mjs 你的密码
 *
 * 同时把明文 CK 存到 .seed/ck.json（已在 .gitignore 里），
 * 只在本地用来生成示例文章；不会进仓库。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const AAD = 'shiguang-ck-v1';
const ITER = 210000;

const password = process.argv[2] || process.env.BLOG_PASSWORD;
if (!password || password.length < 6) {
  console.error('用法：node tools/init-vault.mjs 你的密码（至少 6 位）');
  process.exit(1);
}

const ck = crypto.randomBytes(32);
const salt = crypto.randomBytes(16);
const iv = crypto.randomBytes(12);

const kek = crypto.pbkdf2Sync(password, salt, ITER, 32, 'sha256');
const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
cipher.setAAD(Buffer.from(AAD));
const ct = Buffer.concat([cipher.update(ck), cipher.final()]);
const tag = cipher.getAuthTag();

const lock = {
  v: 2,
  alg: 'AES-256-GCM',
  kdf: 'PBKDF2-SHA256',
  iter: ITER,
  aad: AAD,
  env: [{
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    // WebCrypto 的密文是 ciphertext || tag，这里保持一致
    ct: Buffer.concat([ct, tag]).toString('base64')
  }],
  createdAt: new Date().toISOString()
};

fs.writeFileSync(path.join(ROOT, 'assets/lock.json'), JSON.stringify(lock, null, 2) + '\n');

fs.mkdirSync(path.join(ROOT, '.seed'), { recursive: true });
fs.writeFileSync(path.join(ROOT, '.seed/ck.json'), JSON.stringify({
  ck: ck.toString('base64'),
  password
}, null, 2) + '\n');

console.log('保险库已生成：');
console.log('  assets/lock.json   （密码包裹的内容密钥）');
console.log('  .seed/ck.json      （本地明文密钥，不进仓库）');
