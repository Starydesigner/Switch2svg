#!/bin/bash
cd "$(dirname "$0")"
echo "正在启动 Switch2svg 开发服务器..."
echo "启动后将自动打开浏览器，若无反应请手动访问: http://localhost:5173"
# 约 2 秒后自动用默认浏览器打开项目地址（Vite 默认端口 5173）
(sleep 2 && open "http://localhost:5173") &
npm run dev
