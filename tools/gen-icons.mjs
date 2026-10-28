/* 生成站点图标：纸色底 + 衬线「拾」字 + 一道陶土色细线
 * 用法：node tools/gen-icons.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'icons');

const BG = '#fbf9f6';
const INK = '#191714';
const ACCENT = '#a94f2b';

function svg(size, { maskable = false } = {}) {
  const scale = maskable ? 0.62 : 1;
  const c = size / 2;
  const fontSize = 240 * scale;
  const barW = 112 * scale;
  const barH = 6 * scale;
  const barY = c + 112 * scale;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <text x="${c}" y="${c + fontSize * 0.33}" font-family="Songti SC, SimSun, Microsoft YaHei, serif"
        font-size="${fontSize}" font-weight="600" fill="${INK}" text-anchor="middle" letter-spacing="6">拾</text>
  <rect x="${c - barW / 2}" y="${barY}" width="${barW}" height="${barH}" rx="${barH / 2}" fill="${ACCENT}"/>
</svg>`;
}

async function png(size, opts, file) {
  const buf = await sharp(Buffer.from(svg(size, opts))).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(path.join(OUT, file), buf);
  console.log(file, (buf.length / 1024).toFixed(1) + ' KB');
}

fs.mkdirSync(OUT, { recursive: true });
await png(512, {}, 'icon-512.png');
await png(192, {}, 'icon-192.png');
await png(512, { maskable: true }, 'icon-maskable-512.png');
await png(32, {}, 'favicon-32.png');
await png(180, {}, 'apple-touch-icon.png');
