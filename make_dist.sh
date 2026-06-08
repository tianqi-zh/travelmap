#!/usr/bin/env bash
# 生成可部署的 dist/ 目录：只含网站成品，排除 media/raw 与开发文件。
# 用于 Cloudflare Pages / Netlify 等静态托管的直接上传。
set -e
cd "$(dirname "$0")"

rsync -a --delete \
  --exclude 'media/raw' \
  --exclude 'dist' \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude 'build.py' \
  --exclude 'make_dist.sh' \
  --exclude 'serve.sh' \
  --exclude 'README.md' \
  --exclude '*.zip' \
  ./ dist/

# 清掉可能残留的 .DS_Store
find dist -name '.DS_Store' -delete 2>/dev/null || true

echo "dist/ 已生成："
du -sh dist
echo "文件数：$(find dist -type f | wc -l | tr -d ' ')"
