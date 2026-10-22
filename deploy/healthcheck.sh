#!/bin/bash
# 生产快速检查：公开健康接口、复制页和首页必须可访问。
set -euo pipefail
BASE_URL="${1:-https://kaleido.quest}"
curl -fsS --max-time 15 "$BASE_URL/api/health" >/dev/null
test "$(curl -fsS --max-time 15 -o /dev/null -w '%{http_code}' "$BASE_URL/")" = "200"
test "$(curl -fsS --max-time 15 -o /dev/null -w '%{http_code}' "$BASE_URL/copy/dv-english")" = "200"
echo "KaleidoQuest healthcheck passed: $BASE_URL"
