#!/bin/bash
# 把本地代码同步到 VPS 并重启（不带本地文件所有者，不动服务器上的 data / backups / .env）
set -euo pipefail
cd "$(dirname "$0")/.."
rsync -az --delete --no-owner --no-group -e "ssh -i $HOME/.ssh/wenxin_vps" \
  --exclude node_modules --exclude data --exclude backups --exclude .git --exclude test/shots --exclude .env \
  ./ root@103.253.146.222:/opt/kaleido/
ssh -i ~/.ssh/wenxin_vps root@103.253.146.222 'cd /opt/kaleido && npm ci --omit=dev --silent && install -m 644 deploy/cron.kaleido-backup /etc/cron.d/kaleido-backup && pm2 restart kaleido --update-env >/dev/null && sleep 1 && curl -s 127.0.0.1:3048/api/health'
echo
