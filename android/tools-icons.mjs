/* 生成安卓图标与启动图（从站点图标派生），避免打包后还是 Capacitor 默认的蓝白图标 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const RES = 'android/app/src/main/res';
const SRC = '../icons/icon-512.png';

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

// 图标底色（和网页图标一致）
const BG = { r: 247, g: 243, b: 235, alpha: 1 };

for (const [d, k] of Object.entries(DENS)) {
  const dir = path.join(RES, `mipmap-${d}`);
  fs.mkdirSync(dir, { recursive: true });

  // 传统方形图标 48dp
  await sharp(SRC).resize(Math.round(48 * k)).png().toFile(path.join(dir, 'ic_launcher.png'));

  // 圆形图标：同样内容，系统自己裁
  await sharp(SRC).resize(Math.round(48 * k)).png().toFile(path.join(dir, 'ic_launcher_round.png'));

  // 自适应图标前景：108dp 画布，内容占中间 66%
  const size = Math.round(108 * k);
  const inner = Math.round(size * 0.66);
  const glyph = await sharp(SRC).resize(inner, inner, { fit: 'contain', background: { ...BG, alpha: 0 } }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toFile(path.join(dir, 'ic_launcher_foreground.png'));
}

// 启动图：整块暖色 + 居中图标，一次生成所有密度
const splash = { 'drawable-port-mdpi': [320, 480], 'drawable-port-hdpi': [480, 800], 'drawable-port-xhdpi': [720, 1280], 'drawable-port-xxhdpi': [960, 1600], 'drawable-port-xxxhdpi': [1280, 1920], 'drawable-land-mdpi': [480, 320], 'drawable-land-hdpi': [800, 480], 'drawable-land-xhdpi': [1280, 720], 'drawable-land-xxhdpi': [1600, 960], 'drawable-land-xxxhdpi': [1920, 1280] };

for (const [dir, [w, h]] of Object.entries(splash)) {
  const out = path.join(RES, dir);
  fs.mkdirSync(out, { recursive: true });
  const logo = await sharp(SRC).resize(Math.round(Math.min(w, h) * 0.28)).png().toBuffer();
  await sharp({ create: { width: w, height: h, channels: 4, background: { r: 236, g: 225, b: 198, alpha: 1 } } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(path.join(out, 'splash.png'));
}

console.log('图标与启动图已生成');
