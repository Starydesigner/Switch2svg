/**
 * 根据 switch2svg-data/analysis-folders.json 扫描各分析文件夹，生成 assets-manifest.json
 * 仅扫描配置中的文件夹，无配置或为空则输出空列表。支持 webp。输出 folders 结构。
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..')
const outPath = path.join(projectRoot, 'public', 'assets-manifest.json')
const analysisFoldersPath = path.join(projectRoot, 'switch2svg-data', 'analysis-folders.json')

/** @typedef {{ id: string, name: string, path: string, format: string, images: { scale?: string, filename: string }[] }} AssetEntry */

function getFolderList() {
  if (!fs.existsSync(analysisFoldersPath)) return []
  try {
    const data = JSON.parse(fs.readFileSync(analysisFoldersPath, 'utf8'))
    const names = data.folderNames || data.folders
    if (Array.isArray(names)) return names
  } catch (_) {}
  return []
}

function inferFormat(filename) {
  const ext = path.extname(filename).toLowerCase().slice(1)
  if (ext === 'pdf') return 'pdf'
  if (ext === 'json') return 'lottie'
  if (ext === 'webp') return 'webp'
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
  return ext || 'png'
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp']
const FLAT_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.pdf', '.json']

/**
 * 递归扫描整个分析文件夹：所有层级的 .imageset 与 图片/pdf/lottie 均纳入，不再要求用户逐级选择
 */
function scanFolderRecursive(dir, relPrefix, folderId) {
  const entries = []
  if (!fs.existsSync(dir)) return entries
  const items = fs.readdirSync(dir, { withFileTypes: true })
  for (const item of items) {
    const full = path.join(dir, item.name)
    const rel = path.join(relPrefix, item.name)
    if (item.isDirectory()) {
      if (item.name.endsWith('.imageset')) {
        const contentsPath = path.join(full, 'Contents.json')
        if (fs.existsSync(contentsPath)) {
          const contents = JSON.parse(fs.readFileSync(contentsPath, 'utf8'))
          const images = (contents.images || [])
            .filter((img) => img.filename)
            .map((img) => ({ scale: img.scale, filename: img.filename }))
          const firstFile = images[0]?.filename
          const format = firstFile ? inferFormat(firstFile) : 'png'
          const name = item.name.replace(/\.imageset$/, '')
          entries.push({
            id: `${folderId}-${name}`,
            name,
            path: rel,
            format,
            images,
          })
        }
      } else {
        entries.push(...scanFolderRecursive(full, rel, folderId))
      }
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase()
      if (FLAT_EXTS.includes(ext)) {
        const format = inferFormat(item.name)
        const name = path.basename(item.name, ext)
        entries.push({
          id: `${folderId}-${name}`,
          name,
          path: rel,
          format,
          images: [{ filename: item.name }],
        })
      }
    }
  }
  return entries
}

function scanFolder(folderName, index) {
  const folderId = `folder_${index}`
  const dir = path.join(projectRoot, folderName)
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return { id: folderId, name: folderName, assets: [] }
  }
  const relPrefix = folderName
  const assets = scanFolderRecursive(dir, relPrefix, folderId)
  const normalizePath = (p) => p.replace(/\\/g, '/')
  return {
    id: folderId,
    name: folderName,
    assets: assets.map((e) => ({ ...e, path: normalizePath(e.path) })),
  }
}

function main() {
  const folderNames = getFolderList()
  const folders = folderNames.map((name, i) => scanFolder(name, i))
  const manifest = { folders }
  const publicDir = path.join(projectRoot, 'public')
  if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2), 'utf8')
  const total = folders.reduce((s, f) => s + f.assets.length, 0)
  console.log(`Wrote ${outPath}: ${folders.length} folder(s), ${total} assets`)
}

main()
