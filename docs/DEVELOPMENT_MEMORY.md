# KaleidoQuest 开发记忆

> 最后更新：2026-10-22
> 项目目录：`/Users/haibinzhu/Desktop/工具开发/Kaleido`
> 线上地址：<https://kaleido.quest/>
> GitHub：<https://github.com/longwenhuayu/KaleidoQuest>

## 当前状态

- 生产环境已上线，健康检查：`GET /api/health` 返回 `{"ok":true,"rooms":0}`。
- GitHub `main` 已推送，最近提交：`4de6066 Improve mobile UX and add growth referral features`。
- `.DS_Store` 是本地已有改动，未提交、未上传。
- 部署脚本：`deploy/push.sh`。
- 生产服务器：`root@103.253.146.222:/opt/kaleido/`，PM2 应用名：`kaleido`，端口：`3048`。

## 已完成能力

### 用户体验与手机端

- 移动端首页、游戏库、主持页、报告页和公共分享弹层优化。
- 适配窄屏布局，避免横向滚动；分享弹层在 320px 宽度下已验证。
- 页面统一使用 `public/css/app.css` 和 `public/js/common.js`。

### 增长与社交裂变

- 教师邀请链接：`/api/referral`。
- 注册时记录 `ref` 归因。
- 被邀请教师完成第一局正式游戏后，邀请双方各获得 5 次 AI 出题额度。
- AI 额度逻辑位于 `lib/ai.js`，奖励字段为 `teachers.bonus_ai`。
- 新增复制游戏落地页：`/copy/:id`，文件为 `public/copy.html`。
- 复制页支持试玩、复制来改、分享给同事。
- 成绩报告支持生成成绩卡图片并分享或下载。
- 事件追踪通过 `POST /api/events`，事件存储在 SQLite `events` 表。
- 当前追踪包括页面访问、分享打开、分享动作、注册、开局、邀请激活、复制页访问、试玩和复制完成。

### 管理后台

- `/admin` 新增 Growth 增长面板。
- 展示分享、注册、复制游戏、邀请激活等指标。
- 展示真实邀请排行榜，仅管理员可见。
- 展示最近 30 天分享渠道来源。
- 后端接口：`GET /api/admin/growth`，需要管理员权限。

## 关键文件

- `server.js`：Express 路由、注册、邀请、事件接口、页面路由。
- `lib/db.js`：SQLite 表结构和迁移。旧库迁移必须先补列，再创建依赖新列的索引。
- `lib/game.js`：正式游戏报告保存、首局邀请奖励发放。
- `lib/ai.js`：每日 AI 额度和奖励额度扣减。
- `lib/admin.js`：管理员总览、增长报表、邀请排行榜和渠道统计。
- `public/index.html`：首页、教师注册登录弹窗、邀请归因提示。
- `public/teacher.html`：教师后台、新手任务、邀请进度。
- `public/copy.html`：复制游戏落地页。
- `public/report.html`：赛后报告和成绩卡生成。
- `public/admin.html`：管理员后台和增长面板。
- `public/js/common.js`：多语言、API、分享弹层、事件追踪、归因信息。

## 验证与部署

常用检查：

```bash
node --check server.js
node --check lib/db.js
node --check lib/admin.js
git diff --check
npm test
```

部署：

```bash
./deploy/push.sh
```

部署后检查：

```bash
curl -sS https://kaleido.quest/api/health
curl -sS -o /dev/null -w '%{http_code}' https://kaleido.quest/copy/dv-english
```

## 已知注意事项

- 生产数据库是旧 SQLite 库，涉及新增字段时必须保留兼容迁移；不要删除 `data/` 或重建数据库。
- `deploy/push.sh` 会同步代码但排除 `.env`、`data/`、`backups/` 和 `node_modules/`。
- `npm test` 会启动多个本地端口；如果沙盒禁止监听端口，测试会报 `listen EPERM`，这不是业务断言失败。
- GitHub 推送在 HTTP/2 下曾出现 HTTP 400；如再次发生，使用：

```bash
git -c http.version=HTTP/1.1 -c http.postBuffer=524288000 push
```

## 下一步建议

1. 观察 7 天真实数据，确认邀请点击、注册、首局激活和复制转化漏斗。
2. 增加管理员增长报表 CSV 导出。
3. 增加邀请排行榜时间筛选和按渠道筛选。
4. 做首次登录 3 步引导：选年级、选主题、立即开局。
5. 增加错误监控、启动失败告警和数据库恢复演练。

