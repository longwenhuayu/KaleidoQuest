# KaleidoQuest

**Every subject is a quest.** · [kaleido.quest](https://kaleido.quest)

全班一起玩的课堂实时答题游戏（by Vision Chinese Academy 文心书院）。老师用大屏主持，学生用手机扫码加入，不用注册。

## 本地运行

```bash
npm install
npm start            # http://127.0.0.1:3048（端口和数据库位置见 .env.example）
npm test             # 30 人对局模拟 + 出题插件单元测试
node test/load.js    # 压力测试（对着运行中的服务器，默认 10 房间 × 40 人）
node test/e2e.cjs    # 浏览器端到端（需要 Playwright + Chrome，截图在 test/shots/）
```

需要 Node ≥ 22.5（用内置的 `node:sqlite`，没有原生依赖）。

## 结构

| 位置 | 作用 |
|---|---|
| `server.js` | HTTP 接口（账号、题包、报告）+ WebSocket 路由 |
| `lib/game.js` | 擂台抢答引擎：房间、计时、计分、断线重连、报告 |
| `lib/questions.js` | 通用题目格式和判分（选择 / 判断 / 填空 / 排序），前后端规则一致 |
| `lib/auth.js` | 老师账号：scrypt 密码、HttpOnly 会话、登录限速 |
| `public/` | 页面：首页、老师后台、编辑器、主持大屏、学生端、报告 |
| `public/js/plugins/` | 学科插件：`chinese.js`、`math.js`、`import.js`（读取 Excel / CSV，兼容 Kahoot、Blooket 导出的格式） |

## 加一个学科

在 `public/js/plugins/` 新建一个文件，往 `window.VAPlugins` 推一个 `{ id, icon, name: [中文, English], panel(el, add) }`，
`panel` 里画出出题表单，生成通用格式的题目后调用 `add(questions)`，再在 `edit.html` 引入这个文件。游戏和判分不用改。

## 计分

答对：最快 1000 分、最慢 500 分；从连对第 2 题起每题再加 100，最多 +500。答案只在服务器判，学生端拿不到。

## 部署

部署：改完代码运行 `deploy/push.sh`（同步到 VPS 并重启，不动服务器上的 data / backups / .env）。数据库每天新加坡时间 3:15 备份到 `/opt/kaleido/backups/`，保留 14 天。

配置见 `deploy/`：PM2 配置（进程名 `kaleido`、端口 3048、目录 `/opt/kaleido`）和 nginx 模板（含 WebSocket）。生产环境设 `COOKIE_SECURE=1`。
