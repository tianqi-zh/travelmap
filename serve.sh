#!/usr/bin/env bash
# 本地预览 TravelMap。浏览器打开 http://localhost:8000
cd "$(dirname "$0")" || exit 1
PORT="${1:-8000}"
echo "TravelMap 预览中 ->  http://localhost:${PORT}"
echo "（Ctrl+C 停止）"
python3 -m http.server "$PORT"
