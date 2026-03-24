#!/usr/bin/env bash
# 将 release 构建产物复制到 /Applications（需先执行 npm run tauri:build）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/src-tauri/target/release/bundle/macos/Switch2svg.app"
DEST="/Applications/Switch2svg.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "仅支持 macOS" >&2
  exit 1
fi

if [[ ! -d "$SRC" ]]; then
  echo "未找到 $SRC" >&2
  echo "请先在本仓库执行: npm run tauri:build" >&2
  exit 1
fi

if [[ -d "$DEST" ]]; then
  echo "将覆盖已有: $DEST"
  rm -rf "$DEST"
fi

echo "正在复制到 $DEST …"
cp -R "$SRC" "$DEST"
echo "完成。可在启动台或应用程序中找到 Switch2svg。"
