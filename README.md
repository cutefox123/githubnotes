# 拾光 · DAILY GLEANINGS

一个上锁的日常记录博客。纯静态，跑在 GitHub Pages 上，没有后端、没有数据库、不装统计脚本。

写的是很小的事：早上煮的粥、下雨天的公交站、旧书店里翻到的一本旧书。文章和照片都存在这个公开仓库里，
但全都是加密后的密文 —— 没有访问密码，谁也读不出一句话。

```
https://cutefox123.github.io/githubnotes/
```

---

## 它是怎么工作的

```
访问密码 ──PBKDF2-SHA256(21万次)──> KEK ──解开──> CK（随机内容密钥，32 字节）
                                                    │
                    ┌───────────────────────────────┼──────────────────────────┐
                    ▼                               ▼                          ▼
            posts/index.json              posts/<id>.json              media/<id>-t.bin
            （文章目录，密文）              （正文，密文）                （封面，密文二进制）
```

- 密码只用来「包裹」内容密钥，改密码只需要重新包一次，不用重新加密所有文章。
- 内容密钥（CK）在你解锁后存在浏览器本地，勾了「记住 30 天」就不用每次都输。
- 所有加解密在浏览器里完成（WebCrypto），密码和密钥都不会上传到任何地方。
- 仓库里公开的是**站点骨架**（HTML/CSS/JS），没有密钥的人只能看到一个锁屏。

> 需要说明的边界：这不是军事级保密，只是让「路过看到仓库的人」读不到内容。
> 如果密码太弱，理论上可以被离线暴力破解（PBKDF2 只是拖慢速度）。

---

## 怎么写一篇新文章

打开站点的「写点东西」，第一次会让你连一次 GitHub：

1. 打开 [GitHub 令牌页面](https://github.com/settings/personal-access-tokens/new)
2. Token name 随便填，例如 `拾光写作`
3. Repository access → `Only select repositories` → 勾选 `githubnotes`
4. Permissions → Repository permissions → **Contents: Read and write**
5. 生成后复制 `github_pat_...`，粘贴到站点里点「连接」

之后每次：写标题 → 选日期/天气/心情 → 贴一张封面 → 写正文（支持 Markdown）→ 点「发布」。
正文和封面会在本机加密后提交，大约 30 秒后 GitHub Pages 刷新完，页面会自动跳过去。

令牌只存在这台设备的浏览器里，换设备要重新连一次。写作页右下角可以随时断开。

### 在文章里写 Markdown

支持标题、列表、引用、链接、图片、代码块、表格，以及 `**粗体**`、`*斜体*`、`==高亮==`。
正文里插入的图片如果是外链，不会走加密，注意别放私密照片。

---

## 目录结构

```
index.html                 首页：锁屏 + 封面故事 + 卡片流
post.html?id=<id>          单篇文章
write.html                 写作与编辑（需 GitHub 令牌）
about.html                 关于页（内容是公开的）

assets/lock.json           密码包裹的内容密钥（唯一需要保密的加密文件）
assets/css/blog.css        样式
assets/js/crypto.js        PBKDF2 / AES-GCM 封装
assets/js/vault.js         解锁、会话、加解密内容
assets/js/data.js          取密文 → 解密 → 缓存
assets/js/api.js           GitHub Contents API
assets/js/md.js            轻量 Markdown 渲染
assets/js/site.js          主题、锁屏、日期、提示
assets/js/{home,post,write}.js

posts/index.json           加密的文章目录
posts/<id>.json            加密的正文
media/<id>-t.bin           加密的缩略封面（列表用）
media/<id>-f.bin           加密的大封面（文章页用）

sw.js                      Service Worker（离线可读已看过的文章）
tools/init-vault.mjs       生成新的内容密钥与 lock.json
tools/seed.mjs             把本地明文稿件压缩、加密、写出
tools/gen-icons.mjs        生成站点图标
```

---

## 本地改样式 / 调试

```bash
python -m http.server 8088 --bind 127.0.0.1
# 打开 http://127.0.0.1:8088
```

`localhost` 属于安全上下文，WebCrypto 可用；直接双击 `index.html`（`file://`）不行。

### 重新生成密钥（会丢弃现有密码）

```bash
node tools/init-vault.mjs 新密码
```

这只会换掉 `assets/lock.json` 里的密码包裹层，**内容密钥不变**，所以旧文章还能读。
如果要彻底换内容密钥，得同时重新加密所有文章（`tools/seed.mjs` 会重写示例内容）。

### 重新生成示例文章

```bash
node tools/seed.mjs
```

读取 `.seed/posts/*.json` 的明文和 `.seed/img/*.png` 的原图，压缩后加密写入 `posts/` 与 `media/`。
`.seed/` 已在 `.gitignore` 里，明文稿件和内容密钥都不会进仓库。

---

## 备份

- 文章与封面都在仓库里，克隆一份就是完整备份（没有密码读不了，但有密码就能恢复）。
- 密码丢了就真的打不开了。请自己另外记一份，不要只存在脑子里。

---

## 许可

MIT
