/* 生成示例文章：把 .seed/posts/*.json 的文字和 .seed/img/*.png 的封面
 * 压缩、加密，写出 posts/*.json 与 media/*.bin，并生成加密的目录。
 *
 * 用法：node tools/seed.mjs
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const AAD_CONTENT = 'shiguang-content-v1';
const WATERMARK_CROP = 78; // 去掉生成图右下角的水印

const ckInfo = JSON.parse(fs.readFileSync(path.join(ROOT, '.seed/ck.json'), 'utf8'));
const CK = Buffer.from(ckInfo.ck, 'base64');

function sealJSON(obj) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CK, iv);
  cipher.setAAD(Buffer.from(AAD_CONTENT));
  const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()]);
  return { iv: iv.toString('base64'), ct: Buffer.concat([ct, cipher.getAuthTag()]).toString('base64') };
}

function sealBytes(buf) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', CK, iv);
  const ct = Buffer.concat([cipher.update(buf), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([iv, ct]);
}

async function variants(src) {
  const meta = await sharp(src).metadata();
  const height = Math.max(200, meta.height - WATERMARK_CROP);
  const base = () => sharp(src).extract({ left: 0, top: 0, width: meta.width, height });
  const full = await base().resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true, progressive: true }).toBuffer();
  const thumb = await base().resize({ width: 700, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true, progressive: true }).toBuffer();
  const ratio = meta.width / height;
  return { full, thumb, ratio };
}

function kb(n) { return (n / 1024).toFixed(0) + ' KB'; }

const imgDir = path.join(ROOT, '.seed/img');
const files = fs.readdirSync(imgDir).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
const postFiles = fs.readdirSync(path.join(ROOT, '.seed/posts')).filter((f) => f.endsWith('.json'));

fs.mkdirSync(path.join(ROOT, 'posts'), { recursive: true });
fs.mkdirSync(path.join(ROOT, 'media'), { recursive: true });

const cards = [];
let totalBytes = 0;

for (const file of postFiles.sort()) {
  const post = JSON.parse(fs.readFileSync(path.join(ROOT, '.seed/posts', file), 'utf8'));
  const src = files.find((f) => f.includes(post.image));
  if (!src) {
    console.warn('跳过（找不到封面）：' + post.id);
    continue;
  }

  const { full, thumb, ratio } = await variants(path.join(imgDir, src));

  const fullBin = sealBytes(full);
  const thumbBin = sealBytes(thumb);
  fs.writeFileSync(path.join(ROOT, 'media', post.id + '-f.bin'), fullBin);
  fs.writeFileSync(path.join(ROOT, 'media', post.id + '-t.bin'), thumbBin);

  const now = new Date().toISOString();
  const doc = {
    id: post.id,
    title: post.title,
    date: post.date,
    weather: post.weather || '',
    mood: post.mood || '',
    place: post.place || '',
    tags: post.tags || [],
    excerpt: post.excerpt || '',
    body: post.body || '',
    cover: 'media/' + post.id + '-t.bin',
    coverFull: 'media/' + post.id + '-f.bin',
    coverRatio: Number(ratio.toFixed(3)),
    createdAt: now,
    updatedAt: now
  };

  const sealed = sealJSON(doc);
  fs.writeFileSync(path.join(ROOT, 'posts', post.id + '.json'), JSON.stringify(sealed));

  cards.push({
    id: doc.id,
    title: doc.title,
    date: doc.date,
    weather: doc.weather,
    mood: doc.mood,
    place: doc.place,
    tags: doc.tags,
    excerpt: doc.excerpt,
    cover: doc.cover,
    coverFull: doc.coverFull,
    updatedAt: doc.updatedAt
  });

  totalBytes += fullBin.length + thumbBin.length + JSON.stringify(sealed).length;
  console.log(`${post.id}  ${post.title}  封面 ${kb(full.length)} / 缩略 ${kb(thumb.length)}`);
}

cards.sort((a, b) => String(b.date).localeCompare(String(a.date)) ||
  String(b.updatedAt).localeCompare(String(a.updatedAt)));

const index = {
  v: 1,
  updatedAt: new Date().toISOString(),
  site: { title: '拾光', tagline: '把日子过成可以翻的样子。' },
  posts: cards
};

fs.writeFileSync(path.join(ROOT, 'posts/index.json'), JSON.stringify(sealJSON(index)));

console.log('');
console.log('共 ' + cards.length + ' 篇，密文合计 ' + kb(totalBytes));
console.log('目录：posts/index.json');
