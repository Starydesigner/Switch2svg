#!/usr/bin/env bash
# 在 Tauri 已生成 .app 后，用系统 hdiutil 打包 DMG（规避 bundle_dmg.sh 缺少 create-dmg support 资源时的失败）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP="$ROOT/src-tauri/target/release/bundle/macos/Switch2svg.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "pack-macos-dmg.sh 仅在 macOS 上可用" >&2
  exit 0
fi

if [[ ! -d "$APP" ]]; then
  echo "未找到 $APP，请先执行 npm run tauri:build（或先 tauri build -b app）" >&2
  exit 1
fi

VERSION="$(node -p "require('$ROOT/package.json').version")"
DMG_DIR="$ROOT/src-tauri/target/release/bundle/dmg"
mkdir -p "$DMG_DIR"

ARCH="$(uname -m)"
if [[ "$ARCH" == "arm64" ]]; then
  TAG=aarch64
else
  TAG=x86_64
fi

OUT="$DMG_DIR/Switch2svg_${VERSION}_${TAG}.dmg"
rm -f "$OUT"
# 清理失败残留的可写中间镜像
rm -f "$DMG_DIR"/rw.*.dmg 2>/dev/null || true

hdiutil create -volname "Switch2svg" -srcfolder "$APP" -ov -format UDZO -fs HFS+ "$OUT"
echo "DMG: $OUT"
