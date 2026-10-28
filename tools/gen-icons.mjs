/* 生成应用图标（无第三方依赖，直接输出 PNG） */
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('icons');

/* --- PNG 编码 --- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* --- 绘制 --- */
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

function roundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function triangle(x, y, ax, ay, bx, by, cx, cy) {
  const s = (ax - cx) * (y - cy) - (ay - cy) * (x - cx);
  const t = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  if ((s < 0) !== (t < 0) && s !== 0 && t !== 0) return false;
  const d = (cx - bx) * (y - by) - (cy - by) * (x - bx);
  return d === 0 || (d < 0) === (s + t <= 0);
}

const BG_TOP = hex('#3E8778');
const BG_BOTTOM = hex('#285C52');
const PAPER = hex('#FFFFFF');
const LINE_1 = hex('#9BBDB4');
const LINE_N = hex('#D5E3DF');
const FOLD = hex('#D6E6E1');

function render(size, maskable) {
  const SS = 4;
  const N = size * SS;
  const acc = new Float32Array(size * size * 4);
  const pad = maskable ? 0.16 : 0;

  for (let py = 0; py < N; py++) {
    const yFull = (py + 0.5) / N;
    const y = (yFull - pad) / (1 - pad * 2);
    for (let px = 0; px < N; px++) {
      const xFull = (px + 0.5) / N;
      const x = (xFull - pad) / (1 - pad * 2);

      let r = 0, g = 0, b = 0, a = 0;

      const inBg = maskable ? true : roundRect(xFull, yFull, 0, 0, 1, 1, 0.225);
      if (inBg) {
        const c = mix(BG_TOP, BG_BOTTOM, Math.min(1, Math.max(0, (yFull - 0.05) / 0.9)));
        r = c[0]; g = c[1]; b = c[2]; a = 255;
      }

      const inPaper = y > -0.2 && roundRect(x, y, 0.265, 0.225, 0.735, 0.775, 0.055);
      if (inPaper) { r = PAPER[0]; g = PAPER[1]; b = PAPER[2]; a = 255; }

      const inFold = inPaper && triangle(x, y, 0.605, 0.775, 0.735, 0.645, 0.735, 0.775);
      if (inFold) { r = FOLD[0]; g = FOLD[1]; b = FOLD[2]; }

      const lineY = [0.355, 0.462, 0.569];
      for (let i = 0; i < 3; i++) {
        const xEnd = i === 0 ? 0.585 : 0.655;
        if (roundRect(x, y, 0.345, lineY[i], xEnd, lineY[i] + 0.046, 0.023)) {
          const c = i === 0 ? LINE_1 : LINE_N;
          r = c[0]; g = c[1]; b = c[2];
        }
      }

      const idx = ((py >> 2) * size + (px >> 2)) * 4;
      acc[idx] += r; acc[idx + 1] += g; acc[idx + 2] += b; acc[idx + 3] += a;
    }
  }

  const out = new Uint8Array(size * size * 4);
  const n = SS * SS;
  for (let i = 0; i < out.length; i++) out[i] = Math.round(acc[i] / n);
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, size, mask] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['favicon-32.png', 32, false]
]) {
  const png = encodePNG(size, size, render(size, mask));
  fs.writeFileSync(path.join(OUT, name), png);
  console.log(name, png.length + ' bytes');
}
