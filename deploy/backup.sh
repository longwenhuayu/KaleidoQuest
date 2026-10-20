#!/bin/bash
# 每天备份 KaleidoQuest 数据库：VACUUM INTO 生成一致的快照（服务运行中也安全），gzip 后保留 14 天
# cron：/etc/cron.d/kaleido-backup
set -euo pipefail
APP=/opt/kaleido
DIR=$APP/backups
mkdir -p "$DIR"
OUT="$DIR/kaleido-$(date +%Y%m%d-%H%M).db"
node --disable-warning=ExperimentalWarning -e "
const { DatabaseSync } = require('node:sqlite');
new DatabaseSync('$APP/data/kaleido.db').exec(\"VACUUM INTO '$OUT'\");
"
gzip -9 "$OUT"
find "$DIR" -name 'kaleido-*.db.gz' -mtime +14 -delete
echo "$(date '+%F %T') backup ok $(du -h "$OUT.gz" | cut -f1)"
