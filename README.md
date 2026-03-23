# Switch2svg（APP 图标治理工具）

面向移动应用工程（如 iOS/Android 资源目录）的**图标与图片资源治理**桌面/网页工具：集中浏览素材、按语义或格式分组、配置替换图，并将结果写入项目内的 `Svg_replace` 配置。除**本地目录**外，支持**网络图床**——粘贴图片 **http(s) 直链** 即可与本地素材同样分组、预览与保存。

---

## 功能概览

| 能力 | 说明 |
|------|------|
| **本地目录** | 通过清单 `assets-manifest.json` 列出分析目录，或使用「选择文件夹」即时挂载本地目录（浏览器 FSA / Tauri 原生选目录）。 |
| **网络图床** | 「添加项目」中新增图床分组：粘贴多行 URL 或含链接的 JSON；链式图标标识；可多选复制链接、向已有图床追加直链。**首次保存到磁盘**需在 **Tauri 桌面版**选择父目录生成项目文件夹。 |
| **图床持久化** | 分析目录**根目录**下写入 `switch2svg-remote-assets.json`（含 `kind: remote-bed` 与直链列表），再次打开同一目录会恢复为图床类型与预览数据。 |
| **资源扫描** | 递归识别 `.imageset`、常见位图（PNG/JPEG/WebP 等）、PDF、Lottie（JSON）及 SVG 等；`Svg_replace` 子树不参与素材统计。 |
| **分组与排序** | 左侧大纲 + 右侧卡片网格；支持拖拽调整分组、内置规则分组；「自动语义分组」按文件名等规则归类（无需外接大模型）。 |
| **替换素材** | 按分组上传替换图（可多张），文件写入当前分析目录下的 `Svg_replace`，与 `config.json` 一并管理。 |
| **配置持久化** | 分组、替换映射等保存为 `Svg_replace/config.json`；再次打开同一目录可自动恢复。 |
| **桌面端 HTTP 预览** | 打包应用页面为 HTTPS，**http://** 直链无法直接在 WebView 中加载；通过 `tauri-plugin-http` 在 Rust 侧拉取后转为 `blob:` 预览（需在 `capabilities` 中配置可访问的 URL 范围）。 |
| **SVG 预览改色** | 对适合单色化的线稿类 SVG，通过全局 CSS 变量统一预览 `fill`/`stroke`；多色/渐变等会自动跳过。顶栏「SVG 改色」可「随主题适配」或自定义十六进制颜色。 |
| **主题** | 亮色 / 暗色，设置保存在浏览器 `localStorage`（网页版）或同源策略下。 |

---

## 技术栈

- **前端**：React 18、TypeScript、Vite 5  
- **UI**：自定义样式 + [Lucide React](https://lucide.dev/) 图标  
- **拖拽**：[dnd-kit](https://dndkit.com/)  
- **SVG 内联预览**：[svg-inject](https://github.com/iconfu/svg-inject)  
- **桌面壳**：[Tauri 2](https://v2.tauri.app/)（Rust），插件：`dialog`、`fs`、`http`（远程图拉取）；调试下可选 `log`

---

## 环境要求

- **Node.js**（建议 LTS，与当前 `package.json` 锁文件兼容的版本）  
- **包管理器**：npm（文档以 npm 为准）  
- **桌面打包**：安装 [Rust 稳定版](https://rustup.rs/) 及对应平台 Tauri 依赖（macOS 需 Xcode Command Line Tools 等）

---

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

- **仅前端（浏览器）**——默认开发服务器端口为 **1420**（见 `vite.config.ts`，与 Tauri `devUrl` 一致）：

```bash
npm run dev
```

在浏览器访问：`http://localhost:1420`

- **Tauri 桌面开发**（会拉起同一前端 dev server）：

```bash
npm run tauri:dev
```

> 说明：仓库内若有 `启动项目.command` 等脚本指向其他端口，请以 `vite.config.ts` 与 `src-tauri/tauri.conf.json` 为准。

### 生产构建

- **纯静态资源**（输出到 `dist/`，可部署到任意静态服务器，`base` 为相对路径 `./`）：

```bash
npm run build
```

- **Tauri 应用打包**（会先执行 `beforeBuildCommand` 即 `npm run build`）：

```bash
npm run tauri:build
```

macOS 常见产物示例：

- `src-tauri/target/release/bundle/macos/Switch2svg.app`
- `src-tauri/target/release/bundle/dmg/Switch2svg_*_aarch64.dmg`（架构随本机而定；`npm run tauri:build` 在打出 `.app` 后由 `scripts/pack-macos-dmg.sh` 调用 `hdiutil` 生成，避免部分环境下 Tauri 内置 `bundle_dmg.sh` 缺少 `create-dmg` 资源而失败）

---

## 清单与数据目录

### `public/assets-manifest.json`

开发时由 Vite 提供；结构为 `{ "folders": [ { "id", "name", "assets": [...] } ] }`。  
可通过脚本从本地目录扫描生成：

```bash
npm run build-manifest
```

脚本读取 [`switch2svg-data/analysis-folders.json`](switch2svg-data/analysis-folders.json) 中的文件夹名称列表（字段支持 `folderNames` 或 `folders` 数组），在项目根下扫描对应目录，并把结果写入 `public/assets-manifest.json` 与 `src/assets-manifest.json`（供打包兜底）。  
若清单为空或未配置，仍可通过界面「选择文件夹」使用**实时目录访问**（File System Access / Tauri 原生选目录）。

### `switch2svg-data/analysis-folders.json`

用于 **`build-manifest`** 的「分析文件夹名 → 磁盘路径」配置，示例：

```json
{
  "folderNames": ["ios res", "android res"]
}
```

实际目录名需与项目根下文件夹名称一致（或按你本机目录调整）。

### 分析目录根目录：`switch2svg-remote-assets.json`（图床）

由保存图床分组时写入，与 `Svg_replace` **同级**（均在所选分析目录根下）。记录网络素材的 `displayUrl` 等，并带 `kind: remote-bed`，用于再次打开时识别图床项目与恢复预览。

### `Svg_replace/`（每个分析目录下）

| 路径 | 作用 |
|------|------|
| `Svg_replace/config.json` | 分组、替换映射等应用配置 |
| `Svg_replace/*` | 用户上传的替换图等文件 |

工具会优先使用当前分析根下已有的 `Svg_replace`；若仅在子树中存在，会递归查找第一个匹配的目录用于读写，避免配置与上传目录不一致。目录名大小写不敏感（如 `svg_replace` 也可被识别）。

---

## 运行形态说明

| 形态 | 选目录 / 图床 | 读写项目文件 |
|------|----------------|--------------|
| **浏览器** | 本地：[File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)；图床分组可创建，**保存到磁盘**依赖上述 API（与桌面版能力不完全一致） | 依赖用户授权；需支持该 API 的浏览器 |
| **Tauri 桌面** | 本地：原生文件夹对话框 + `tauri-plugin-fs`；图床：首次保存可选父目录生成项目文件夹 | 使用绝对路径读写；**http 图床预览**走 `tauri-plugin-http` |

前端通过 `@tauri-apps/api/core` 的 `isTauri` 在运行时分支处理。

---

## 应用图标（Tauri）

图标源文件放置后，可使用官方 CLI 生成 `src-tauri/icons` 下全套资源，例如：

```bash
npx tauri icon path/to/your-1024x1024.png -o src-tauri/icons
```

也可使用带 `default` 与可选 `bg_color` 的 manifest JSON（适用于透明底 SVG）。详见 `npx tauri icon --help`。  
[`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) 的 `bundle.icon` 需指向生成后的 `png` / `icns` / `ico`。

---

## 目录结构（摘要）

```
Switch2svg/
├── public/                 # 静态资源；含 assets-manifest.json（可生成）
├── scripts/
│   └── build-manifest.js   # 扫描本地文件夹 → 写入 public/ 与 src/ 的 manifest
├── src/                    # React 源码
│   ├── App.tsx
│   ├── components/         # 页面与 UI 组件
│   ├── utils/              # FSA、分类、远程图预览等
│   └── types.ts
├── src-tauri/              # Tauri 后端与打包配置
│   ├── src/
│   ├── icons/              # 应用图标（由 tauri icon 生成）
│   ├── capabilities/       # 含 http 插件 URL 范围等
│   └── tauri.conf.json
├── switch2svg-data/        # build-manifest 用的文件夹列表配置
├── vite.config.ts          # 开发服务器、清单目录静态映射等
├── package.json
└── README.md
```

---

## 配置与隐私说明

- **主题 / SVG 改色**：使用 `localStorage` 持久化（见 `App.tsx` 中 `THEME_KEY`、`SVG_TINT_KEY` 等）。  
- **网络请求**：图床预览在桌面端由 `tauri-plugin-http` 发起，可访问范围由 `src-tauri/capabilities/default.json` 中 `http:default` 的 `allow` 列表约束（默认示例为较宽的 `http://*/*` 与 `https://*/*`，分发前可按安全需求收紧）。

---

## 已知注意事项

- Tauri 构建可能提示 **bundle identifier** 以 `.app` 结尾不理想：当前为 `com.switch2svg.app`，若需上架或长期维护，建议改为不含 `.app` 后缀的反向域名。  
- **`app.security.csp`** 在 `tauri.conf.json` 中已配置（含 `img-src` 对 `http:`/`https:` 等）；若接入新的远程能力，请同步评估 CSP 与 `http` 插件白名单。  
- 部分图床若校验 **Referer**、**Cookie** 或仅允许浏览器访问，Rust 侧拉取仍可能失败，需换可直链地址或自行扩展请求头（当前未内置）。  
- 依赖漏洞与构建回归请定期执行 `npm audit`、`npm run build`、`npm run tauri:build` 自行验证。

---

## 许可证

仓库根目录当前**未包含**独立 `LICENSE` 文件；Rust 侧 [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml) 中 `license` 字段亦为占位。若需开源或分发，请自行补充许可证文本并在前后端配置中写清版权信息。

---

## 版本

当前包版本见 [`package.json`](package.json) 中的 `version` 字段（与 `src-tauri/tauri.conf.json` 中 `version` 宜保持同步）。
