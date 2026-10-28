/* 自带的轻量 Markdown 渲染器 —— 无需任何外部依赖 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

/* ---------------- 行内 ---------------- */

function safeUrl(u) {
  const s = String(u || '').trim();
  if (/^(https?:\/\/|mailto:|#|\/|\.\/)/i.test(s)) return s;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);/i.test(s)) return s;
  return '#';
}

function inlineText(raw) {
  const store = [];
  const keep = (html) => { store.push(html); return `\u0000${store.length - 1}\u0000`; };

  let s = escapeHtml(raw);

  // 图片 ![alt](url)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_m, alt, url) =>
    keep(`<img src="${safeUrl(url)}" alt="${alt}" loading="lazy">`));

  // 链接 [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, text, url) =>
    keep(`<a href="${safeUrl(url)}" target="_blank" rel="noopener noreferrer">${inlineText(text)}</a>`));

  // 裸链接
  s = s.replace(/(^|[\s，。；：、）】"'><])((?:https?:\/\/|www\.)[^\s<"）】。，；]+)/g, (_m, pre, url) => {
    const href = url.startsWith('www.') ? 'https://' + url : url;
    return pre + keep(`<a href="${safeUrl(href)}" target="_blank" rel="noopener noreferrer">${url}</a>`);
  });

  // 强调
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w])_([^_\n]+)_(?![\w])/g, '$1<em>$2</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/==([^=]+)==/g, '<mark>$1</mark>');

  return s.replace(/\u0000(\d+)\u0000/g, (_m, i) => store[Number(i)] || '');
}

export function inline(raw) {
  const parts = String(raw).split(/(`[^`\n]*`)/g);
  return parts.map((p) => {
    if (p.length >= 2 && p.startsWith('`') && p.endsWith('`')) {
      return `<code>${escapeHtml(p.slice(1, -1))}</code>`;
    }
    return inlineText(p);
  }).join('');
}

/* ---------------- 块级 ---------------- */

const RE_LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const RE_HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const RE_HR = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const RE_QUOTE = /^\s*>\s?/;

function parseList(lines, start) {
  const first = lines[start].match(RE_LIST);
  const ordered = /\d/.test(first[2]);
  const baseIndent = first[1].length;
  const items = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const nm = j < lines.length ? lines[j].match(RE_LIST) : null;
      if (nm && nm[1].length >= baseIndent) { i = j; continue; }
      break;
    }
    const m = line.match(RE_LIST);
    if (!m) break;
    const indent = m[1].length;
    if (indent < baseIndent) break;
    if (indent > baseIndent) {
      if (!items.length) break;
      const sub = parseList(lines, i);
      items[items.length - 1].children += sub.html;
      i = sub.next;
      continue;
    }
    if (ordered !== /\d/.test(m[2])) break;

    let text = m[3];
    let task = null;
    const tm = text.match(/^\[([ xX])\]\s*([\s\S]*)$/);
    if (tm) {
      task = tm[1].toLowerCase() === 'x';
      text = tm[2];
    }
    const item = { text, task, line: i, children: '' };
    items.push(item);
    i++;
    // 续行（缩进更深的普通文本）
    while (i < lines.length) {
      const l = lines[i];
      if (!l.trim()) break;
      if (RE_LIST.test(l)) break;
      const ind = (l.match(/^(\s*)/) || ['', ''])[1].length;
      if (ind <= baseIndent) break;
      item.text += ' ' + l.trim();
      i++;
    }
  }

  const tag = ordered ? 'ol' : 'ul';
  const html = items.map((it) => {
    if (it.task === null) return `<li>${inline(it.text)}${it.children}</li>`;
    return `<li class="todo${it.task ? ' done' : ''}"><label>` +
      `<input type="checkbox" data-line="${it.line}"${it.task ? ' checked' : ''}>` +
      `<span>${inline(it.text)}</span></label>${it.children}</li>`;
  }).join('');

  return { html: `<${tag}>${html}</${tag}>`, next: i };
}

export function renderMarkdown(src = '') {
  const lines = String(src).replace(/\r\n?/g, '\n').replace(/\t/g, '  ').split('\n');
  let html = '';
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    // 代码块
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w+-]*)\s*$/);
    if (fence) {
      const mark = fence[1];
      const lang = fence[2] || '';
      const buf = [];
      i++;
      while (i < lines.length && !new RegExp('^\\s*' + mark[0] + '{' + mark.length + ',}\\s*$').test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // 跳过结束围栏
      html += `<pre><code${lang ? ` class="lang-${escapeHtml(lang)}"` : ''}>${escapeHtml(buf.join('\n'))}</code></pre>`;
      continue;
    }

    // 标题
    const h = line.match(RE_HEADING);
    if (h) {
      const lv = h[1].length;
      html += `<h${lv}>${inline(h[2])}</h${lv}>`;
      i++;
      continue;
    }

    // 分隔线
    if (RE_HR.test(line) && !RE_LIST.test(line)) {
      html += '<hr>';
      i++;
      continue;
    }

    // 引用
    if (RE_QUOTE.test(line)) {
      const buf = [];
      while (i < lines.length && (RE_QUOTE.test(lines[i]) || (buf.length && lines[i].trim() === ''))) {
        if (!lines[i].trim()) { buf.push(''); i++; continue; }
        buf.push(lines[i].replace(RE_QUOTE, ''));
        i++;
      }
      html += `<blockquote>${buf.join('\n').split('\n').map((l) => (l.trim() ? `<p>${inline(l)}</p>` : '')).join('')}</blockquote>`;
      continue;
    }

    // 表格
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const cells = (row) => row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(line);
      i += 2;
      let body = '';
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        body += '<tr>' + cells(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>';
        i++;
      }
      html += `<table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
      continue;
    }

    // 列表
    if (RE_LIST.test(line)) {
      const r = parseList(lines, i);
      html += r.html;
      i = r.next;
      continue;
    }

    // 段落
    const buf = [];
    while (i < lines.length && lines[i].trim()) {
      const l = lines[i];
      if (RE_HEADING.test(l) || RE_HR.test(l) || RE_QUOTE.test(l) || RE_LIST.test(l)) break;
      if (/^\s*(```+|~~~+)/.test(l)) break;
      buf.push(l);
      i++;
    }
    if (buf.length) html += `<p>${buf.map((l) => inline(l)).join('<br>')}</p>`;
    else i++;
  }

  return html;
}

/* ---------------- 纯文本 ---------------- */

export function stripMarkdown(src = '') {
  return String(src)
    .replace(/\r\n?/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*([-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/gm, '')
    .replace(/^\s*\|?[\s:|-]{3,}\|?\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/^\s*-{3,}\s*$/gm, ' ')
    .replace(/[*_~`=]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function noteTitle(content = '', fallback = '无标题') {
  const lines = String(content).split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const t = stripMarkdown(line).replace(/^#+\s*/, '').trim();
    if (t) return t.length > 90 ? t.slice(0, 90) + '…' : t;
  }
  return fallback;
}

export function excerptOf(content = '', limit = 120) {
  const lines = String(content).split('\n');
  let titleIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (stripMarkdown(lines[i]).trim()) { titleIdx = i; break; }
  }
  const rest = titleIdx >= 0 ? stripMarkdown(lines.slice(titleIdx + 1).join('\n')) : '';
  const text = rest || stripMarkdown(content);
  return text.length > limit ? text.slice(0, limit) + '…' : text;
}

export function toggleCheckboxAt(content, lineIndex) {
  const lines = String(content).split('\n');
  if (lineIndex < 0 || lineIndex >= lines.length) return content;
  const line = lines[lineIndex];
  if (/- \[ \]/.test(line)) lines[lineIndex] = line.replace(/- \[ \]/, '- [x]');
  else if (/- \[[xX]\]/.test(line)) lines[lineIndex] = line.replace(/- \[[xX]\]/, '- [ ]');
  else return content;
  return lines.join('\n');
}

/** 从正文中提取 #标签（跳过代码块与行内代码） */
export function extractTags(content = '') {
  const clean = String(content)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ');
  const re = /(^|[\s(（[【>])#([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9_-]{0,19})(?=[\s,，。；;:：、)）\]】!?？]|$)/gu;
  const out = [];
  let m;
  while ((m = re.exec(clean)) && out.length < 15) {
    if (!out.includes(m[2])) out.push(m[2]);
  }
  return out;
}
