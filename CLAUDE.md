# KaleidoQuest 开发记忆

> 续做前先读这份；结束前把新进展、新坑、待办更新到这里。最后更新：2026-10-23

**KaleidoQuest — Every subject is a quest.** 课堂实时答题游戏，by Vision Chinese Academy 文心书院（2026-10-21 曾短暂改名 Dragon Chinese，已恢复）。页脚和海报底部写「© Vision Chinese Academy 文心书院 · visionchinese.com」。
线上 https://kaleido.quest · 负责人 朱海滨（回复用中文）。本地目录叫 `vision-arena`（旧名 Vision Arena），对外一律用 KaleidoQuest。

## 线上环境

- VPS：`ssh -i ~/.ssh/wenxin_vps root@103.253.146.222`，代码在 `/opt/kaleido`，PM2 名 `kaleido`，端口 3048，Node 22（用内置 `node:sqlite`）
- 数据库 `/opt/kaleido/data/kaleido.db`；每天 3:15 SGT 自动备份到 `/opt/kaleido/backups`（留 14 天，`deploy/backup.sh` + `/etc/cron.d/kaleido-backup`）
- nginx：`/etc/nginx/sites-enabled/kaleido.quest`（www → 裸域 301，certbot HTTPS，证书到 2027-01-18）；DNS 在 name.com
- `.env`（600 权限，**不在 git、部署不覆盖**）：APP_URL、SMTP_*（mail.visionchinese.com:2525，noreply@visionchinese.com）、MAIL_FROM、ADMIN_EMAILS=zhuhaibin1980@hotmail.com、SILICONFLOW_API_KEY（和本机 `../games-api/.env` 同一个）
- 真实老师账号：longwenhuayu@gmail.com、zhuhaibin1980@hotmail.com（管理员）、dreamxf87@gmail.com（2026-10-20 从老师群来的第一位外部老师）

## 部署

```bash
./deploy/push.sh        # rsync 到 VPS → npm ci → pm2 restart → 打印 /api/health
```
- rsync 排除 `/data /backups /.env node_modules .git test/shots`。**排除规则必须带前导 `/`**：以前写成 `data` 把 `lib/data`、`public/data` 也排除了，线上直接坏掉。
- HTML 是 `no-cache`，其他静态文件缓存 1 小时 → **改了 css/js 要更新 HTML 里的 `?v=`**（如 `app.css?v=20261021d`），否则老访客会拿到新页面配旧样式。
- 在正式站跑测试会建 `%@test.sg` 账号，测完要删（在 VPS 上 `DELETE FROM teachers WHERE email LIKE '%@test.sg'`，开 `PRAGMA foreign_keys = ON` 连带删除）。

## 本地开发和测试

```bash
DB_PATH=/tmp/claude-501/kq.db PORT=3048 node --disable-warning=ExperimentalWarning server.js   # 本地服务器（测试库放 /tmp）
npm test        # sim / treasure / homework / admin / gallery / students / plugins，看退出码，不要只 grep
node test/e2e.cjs  e2e-treasure  e2e-homework  e2e-gallery  e2e-classes  e2e-avatar  e2e-admin  eye  reset-ui   # 浏览器测试，截图在 test/shots/
```
- Playwright 借用 `~/Desktop/工具开发/xiaohongshu-loop/node_modules/playwright`（channel: chrome）；sharp 借用 `~/Desktop/工具开发/board-game-studio/node_modules/sharp`。本机没有 ffmpeg。
- `e2e-classes` 加 `AI=1` 会真的调用 AI 出题。`reset-ui` 需要 `SERVER_LOG` 指向服务器日志，并且库里先有 me@x.sg。
- 端口 8766 是别的会话的，别杀。本机 3048 常被一个旧的开发服务器占着（2026-10-20 起），新起的会 EADDRINUSE 静默失败、测试打到旧代码上 → 本地测试换端口（如 3149）并用 `BASE=http://127.0.0.1:3149`。

## 结构

- `server.js`：Express + ws。老师账号 / 找回密码 / 题包 / 报告 API，WebSocket 主持和加入；HTML `no-cache`
- `lib/db.js` 建表（teachers, sessions, sets, games, resets）；各模块自己建自己的表
- `lib/auth.js` scrypt + HttpOnly cookie `va_session`；`requireTeacher / requireAdmin`；导出 `cookies()`
- `lib/questions.js` 题型 mcq / tf / input / order 的清洗、判分、给学生的版本（不带答案）
- `lib/game.js` 擂台抢答引擎（含「不计速度」`room.accuracy`、卡片头像校验 `cardAvatar`）；`lib/treasure.js` 夺宝模式
- `lib/homework.js` 作业（/hw/:code，attempts 表含 student_id）
- `lib/gallery.js` 游戏库：`/api/gallery`、`/api/collections`（按新加坡日期判断节日专题）、复制、免登录试玩 `/try/:id`（内存）、访客投屏限流
- `lib/students.js` 班级 / 学生 4 位 PIN / cookie `kq_student` / 服务器卡册 `award()`（按 reward id 去重）/ 学习记录 `record()` 写 `student_results`（擂台、夺宝、作业、试玩四个结算点都调用；按 ref 去重；没登录不记）→ 老师 `/api/classes/:id/students/:sid/results`、学生 `/api/student/results`，前端共用 `VA.history()`
- `lib/ai.js` AI 出题（SiliconFlow `deepseek-ai/DeepSeek-V3`，每位老师每天 30 次，记在内存里，重启清零）
- `lib/cards.js` + `lib/data/hanzi-ety.json` 收集卡抽卡；`lib/admin.js` 管理后台；`lib/mail.js`
- `lib/data/gallery.json` / `collections.json` 由 `scripts/build-gallery.js` 生成（**改题改这个脚本再跑**；用固定种子，新游戏只能往后加，否则旧游戏选项顺序会变）
- 前端 `public/`：index（首页 + 登录弹窗）、gallery、teacher（+ js/classes.js）、edit（+ js/edit.js、plugins/ai|chinese|math|import）、host、play、hw（也服务 /try/:id）、report、cards、me（学生登录）、guide、privacy（隐私说明）、poster、admin、reset
- `public/js/common.js`：`VA`（i18n `tt(zh,en)`、`icon()`、`subjectIcon()`、`pickMode()`、`av()` 头像、`mascot()` 吉祥物…）；`js/cards-ui.js`（`KQC`）；`js/gallery-ui.js`（`KQG`）
- 图片资源：`public/card-art/`（44 张卡）、`gallery-covers/`（37 张）、`mascot/`（hello/think/cheer/point/wait）、`loops/`（首页动图）、`icons.svg`（Lucide，`scripts/build-icons.js` 生成，加图标改那里）
- 生成脚本：`scripts/gen-card-art.js`、`gen-gallery-covers.js`（Qwen-Image；key 从环境变量传，不写进仓库）、`record-loops.js`（录首页动图）
- 海报：`poster/kaleidoquest-poster.png / .pdf`，网页版 `/poster`
- 推广：`docs/KaleidoQuest-推广策略书.docx`（2026-10 至 2027-04 四阶段计划，北极星指标「每周活跃老师」）、`docs/推广文案.md`（四个版本）

- **隐私说明 `/privacy` 写的都是实际做法**：改了数据收集、保存期限、第三方服务、cookie 或锁定规则时，要同步更新这一页和它的日期。

## 设计约定

- 品牌：深夜空底 `#0e0b26` + 万花筒六色光晕（`body.home`）；选项色 `#7c3aed #16a34a #0891b2 #ea580c #2563eb #db2777`（经过色盲校验），加字母徽章和底纹三重区分
- UI 图标用 Lucide；emoji 只留在头像、宝箱、奖牌、卡片知识点
- AI 插画统一画风：「万花筒切面的 Q 版角色 + 夜空底 + 品牌色」；提示词里**不要出现品牌名和色值**（会被画成文字），生成后裁掉四周去掉平台角标，并在卡册注明「插画由 AI 生成」
- 不在对外文案里拿 Kahoot / Blooket 做比较（导入功能里只做事实性说明）
- 文案：「老师免费」「学生不用注册」；改收费时要同步改首页、指南、海报、推广文案

## 已完成（按时间）

课堂擂台 → 夺宝 → 作业 → 收集卡 → 找回密码 → 管理后台 → 品牌重做 / Lucide 图标 → 游戏库 25 个 + 免登录试玩 / 访客投屏 → 首页配色 → 44 张 AI 卡片插画 → 上手指南 / 海报 / 推广文案 → AI 出题 → 班级与学生账号 → 第一批（首页改版、动图、封面）→ 第二批（吉祥物、卡片头像）→ 第三批（后台新手清单、功能入口、不计速度）→ 第四批（4 个节日专题 12 个游戏、游戏库搜索）→ 学生学习记录（2026-10-23：班级表加局数/正确率/最近，点名字看记录和常错题；学生 /me「我的成绩」）

## 待办 / 未决

- 等老师群的反馈（2026-10-20 已发推广文案），按反馈定下一步；留意管理后台的注册和开局数据
- 节日专题的题（尤其屠妖节、开斋节）请熟悉的老师核对；农历节日的显示窗口每年按实际日期微调
- 马来文、淡米尔文游戏：等母语老师审内容
- 没登录的学生选卡片头像时服务器无法核实是否拥有（影响小）
- SMTP 密码曾在对话里出现过且和别处共用，建议更换（用户说先搁置）
- 正式收费前请律师看用户条款和学生隐私
- 以后可做：英文 / 科学出题插件、全班守城模式、更多节日专题、卡片与头像的更多玩法
