/* 把站点根目录的静态文件同步到 www/ —— 安卓包里只放网页，不放工程文件 */
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('..');
const DST = path.resolve('www');

const SKIP_DIRS = new Set(['android', 'node_modules', 'www', 'tools', '.git', '.workbuddy', '.seed', '.mock', '.legacy']);
const SKIP_FILES = new Set(['sw.js', 'README.md', 'LICENSE', '.gitignore', '.gitattributes', 'package.json', 'package-lock.json']);

fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });

function walk(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      fs.mkdirSync(path.join(to, entry.name), { recursive: true });
      walk(path.join(from, entry.name), path.join(to, entry.name));
    } else {
      if (SKIP_FILES.has(entry.name)) continue;
      if (/^\./.test(entry.name)) continue;
      fs.copyFileSync(path.join(from, entry.name), path.join(to, entry.name));
    }
  }
}

walk(SRC, DST);

let count = 0;
let bytes = 0;
function stat(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) stat(p);
    else { count++; bytes += fs.statSync(p).size; }
  }
}
stat(DST);
console.log(`www 同步完成：${count} 个文件，${(bytes / 1048576).toFixed(1)} MB`);
