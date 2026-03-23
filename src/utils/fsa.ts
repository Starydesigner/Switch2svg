import { isTauri } from '@tauri-apps/api/core'
import type { AnalysisFoldersConfig, AssetEntry, FolderManifest, ReplacementItem } from '../types'
import type { CategorySection } from './categories'

/** 与 Svg_replace 写入目录名一致；分析时整棵子树不参与素材统计与展示 */
const SVG_REPLACE_DIR_NAME = 'Svg_replace'

/** 可生成 blob URL 在浏览器中直接预览的平面文件扩展名 */
const PREVIEW_IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'])

function inferFormat(filename: string): string {
  const lower = filename.toLowerCase()
  const dot = lower.lastIndexOf('.')
  if (dot <= 0 || dot === lower.length - 1) return 'file'
  const ext = lower.slice(dot + 1)
  if (ext === 'pdf') return 'pdf'
  if (ext === 'json') return 'json'
  if (ext === 'webp') return 'webp'
  if (ext === 'gif') return 'gif'
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
  if (ext === 'svg') return 'svg'
  return ext || 'file'
}

const DATA_DIR = 'switch2svg-data'
const ANALYSIS_FOLDERS_FILE = 'analysis-folders.json'
const SVG_REPLACE_CONFIG_FILE = 'config.json'
/** 与 Svg_replace 同级：持久化图床/链接类素材（仅 JSON，便于再次「选择文件夹」恢复预览与分组 id） */
const REMOTE_ASSETS_FILE = 'switch2svg-remote-assets.json'

function checkFSA(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** 桌面端（Tauri）用原生对话框选目录；浏览器用 FSA DirectoryHandle */
export type LiveFolderAccess =
  | { kind: 'fsa'; handle: FileSystemDirectoryHandle }
  | { kind: 'tauri'; rootPath: string }

function folderBasename(p: string): string {
  const n = p.replace(/\\/g, '/').replace(/\/+$/, '')
  const i = n.lastIndexOf('/')
  return (i >= 0 ? n.slice(i + 1) : n) || 'folder'
}

/** 与 FSA 一致；额外兼容磁盘上大小写不一致的目录名（如 svg_replace） */
function isSvgReplaceFolderName(name: string): boolean {
  return name === SVG_REPLACE_DIR_NAME || name.toLowerCase() === SVG_REPLACE_DIR_NAME.toLowerCase()
}

function normalizeTauriRootPath(p: string): string {
  return p.replace(/[/\\]+$/, '')
}

async function findSvgReplacePathTauri(rootPath: string): Promise<string | null> {
  const { readDir } = await import('@tauri-apps/plugin-fs')
  const { join } = await import('@tauri-apps/api/path')
  const root = normalizeTauriRootPath(rootPath)

  try {
    const entries = await readDir(root)
    const direct = entries.find((e) => e.isDirectory && isSvgReplaceFolderName(e.name))
    if (direct) return await join(root, direct.name)
  } catch (_) {}

  async function walk(dirPath: string): Promise<string | null> {
    let entries: Awaited<ReturnType<typeof readDir>>
    try {
      entries = await readDir(dirPath)
    } catch (_) {
      return null
    }
    for (const entry of entries) {
      if (!entry.isDirectory) continue
      const childPath = await join(dirPath, entry.name)
      if (isSvgReplaceFolderName(entry.name)) return childPath
      const found = await walk(childPath)
      if (found) return found
    }
    return null
  }

  return walk(root)
}

async function getSvgReplacePathForWriteTauri(rootPath: string): Promise<string> {
  const { mkdir } = await import('@tauri-apps/plugin-fs')
  const { join } = await import('@tauri-apps/api/path')
  const root = normalizeTauriRootPath(rootPath)
  const existing = await findSvgReplacePathTauri(root)
  if (existing) return existing
  const p = await join(root, SVG_REPLACE_DIR_NAME)
  await mkdir(p, { recursive: true })
  return p
}

/**
 * 在用户选中的目录中查找 Svg_replace 目录：
 * - 优先查当前目录下的 Svg_replace
 * - 若不存在，则递归查找子目录中的第一个 Svg_replace
 */
async function findSvgReplaceDirectory(
  root: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await root.getDirectoryHandle(SVG_REPLACE_DIR_NAME, { create: false })
  } catch (_) {}

  async function walk(dir: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
    for await (const [name, entry] of (dir as any).entries()) {
      if (entry.kind !== 'directory') continue
      const child = entry as FileSystemDirectoryHandle
      if (name === SVG_REPLACE_DIR_NAME) return child
      const found = await walk(child)
      if (found) return found
    }
    return null
  }

  return walk(root)
}

/**
 * 获取用于写入的 Svg_replace 目录：与读取时一致（先递归查找已有 Svg_replace，找不到再在当前目录下创建）。
 * 这样上传的替换文件和 config.json 始终落在同一目录，避免「读到子目录的 config 却写到根下 Svg_replace」导致上传后看不见。
 * 若递归查找抛错（如无权限遍历子目录），则回退到在当前目录下创建 Svg_replace。
 */
async function getSvgReplaceForWrite(
  root: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle> {
  try {
    const existing = await findSvgReplaceDirectory(root)
    if (existing) return existing
  } catch (_) {
    /* 递归查找失败时使用根下 Svg_replace */
  }
  return await root.getDirectoryHandle(SVG_REPLACE_DIR_NAME, { create: true })
}

/**
 * 请求用户选择项目根目录，读取 switch2svg-data/analysis-folders.json
 */
export async function loadAnalysisFolders(): Promise<AnalysisFoldersConfig | null> {
  if (!checkFSA()) return null
  try {
    const dirHandle = await (window as any).showDirectoryPicker({ mode: 'read' })
    const dataDir = await dirHandle.getDirectoryHandle(DATA_DIR, { create: false })
    const fileHandle = await dataDir.getFileHandle(ANALYSIS_FOLDERS_FILE, { create: false })
    const file = await fileHandle.getFile()
    const text = await file.text()
    return JSON.parse(text) as AnalysisFoldersConfig
  } catch (e: any) {
    if (e?.name === 'NotFoundError' || e?.message?.includes('A requested file or directory could not be found')) return null
    throw e
  }
}

/**
 * 请求用户选择项目根目录，写入 switch2svg-data/analysis-folders.json
 */
export async function saveAnalysisFolders(config: AnalysisFoldersConfig): Promise<void> {
  if (!checkFSA()) throw new Error('当前浏览器不支持文件系统访问')
  const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  let dataDir: FileSystemDirectoryHandle
  try {
    dataDir = await dirHandle.getDirectoryHandle(DATA_DIR, { create: false })
  } catch {
    dataDir = await dirHandle.getDirectoryHandle(DATA_DIR, { create: true })
  }
  const fileHandle = await dataDir.getFileHandle(ANALYSIS_FOLDERS_FILE, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify(config, null, 2))
  await writable.close()
}

/**
 * 用户选择项目根目录，列出其下子文件夹名称，并返回根 handle 供后续写入配置（仅一次选择）
 */
export async function pickProjectRootAndListFolders(): Promise<{
  rootHandle: FileSystemDirectoryHandle
  folderNames: string[]
}> {
  if (!checkFSA()) throw new Error('当前浏览器不支持文件系统访问')
  const rootHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  const folderNames: string[] = []
  for await (const [name, entry] of rootHandle.entries()) {
    if (entry.kind === 'directory' && name !== DATA_DIR) folderNames.push(name)
  }
  folderNames.sort()
  return { rootHandle, folderNames }
}

/**
 * 用户直接选择要分析的文件夹（一次选择，不再从子文件夹列表中选）
 * - 浏览器：File System Access API
 * - Tauri：系统原生目录对话框（WKWebView 下 showDirectoryPicker 通常无效）
 */
export async function pickAnalysisFolderDirect(): Promise<{
  access: LiveFolderAccess
  folderName: string
}> {
  if (isTauri()) {
    const { open } = await import('@tauri-apps/plugin-dialog')
    /**
     * recursive: 把子目录纳入 fs 作用域，否则常能列目录/读部分文件，但读不到 Svg_replace/config.json
     * fileAccessMode: 'scoped'：macOS 上对所选目录保持安全作用域访问（默认 copy 模式可能无法稳定访问深层文件）
     */
    let selected: string | null
    try {
      selected = await open({
        directory: true,
        multiple: false,
        recursive: true,
        fileAccessMode: 'scoped',
      })
    } catch {
      selected = await open({
        directory: true,
        multiple: false,
        recursive: true,
      })
    }
    if (selected === null) {
      throw new DOMException('The user aborted a request.', 'AbortError')
    }
    const rootPath = normalizeTauriRootPath(selected as string)
    return { access: { kind: 'tauri', rootPath }, folderName: folderBasename(rootPath) }
  }
  if (!checkFSA()) throw new Error('当前浏览器不支持文件系统访问')
  const folderHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  return { access: { kind: 'fsa', handle: folderHandle }, folderName: folderHandle.name }
}

/**
 * 选择父目录（图床/链接分组「保存」时，在其下新建项目子文件夹）。
 */
export async function pickParentDirectoryTauri(): Promise<string | null> {
  if (!isTauri()) return null
  const { open } = await import('@tauri-apps/plugin-dialog')
  let selected: string | null
  try {
    selected = await open({
      directory: true,
      multiple: false,
      recursive: true,
      fileAccessMode: 'scoped',
    })
  } catch {
    selected = await open({
      directory: true,
      multiple: false,
      recursive: true,
    })
  }
  if (selected === null) return null
  return normalizeTauriRootPath(selected as string)
}

function sanitizeBundleDirName(name: string): string {
  const s = name.replace(/[/\\?*:]/g, '_').trim()
  return s || 'switch2svg_bundle'
}

function isHttpDisplayUrl(url: string | undefined): boolean {
  return typeof url === 'string' && /^https?:\/\//i.test(url)
}

function normalizeStoredRemoteAsset(a: AssetEntry): AssetEntry {
  const images = Array.isArray(a.images) && a.images.length > 0 ? a.images : [{ filename: 'image' }]
  return {
    id: a.id,
    name: a.name,
    path: a.path,
    format: a.format || 'png',
    images,
    displayUrl: a.displayUrl,
    imagePreviewable: isHttpDisplayUrl(a.displayUrl) ? a.imagePreviewable !== false : !!a.displayUrl,
    size: a.size,
  }
}

type RemoteAssetsSidecarParsed = {
  version?: number
  kind?: string
  assets?: unknown[]
}

function parseRemoteAssetsSidecar(text: string): {
  assets: AssetEntry[]
  sourceKind?: 'remote-bed'
} {
  try {
    const parsed = JSON.parse(text) as RemoteAssetsSidecarParsed
    const raw = Array.isArray(parsed.assets) ? parsed.assets : []
    const assets = raw.map((x) => normalizeStoredRemoteAsset(x as AssetEntry))
    if (parsed.kind === 'remote-bed') {
      return { assets, sourceKind: 'remote-bed' }
    }
    if (
      assets.length > 0 &&
      assets.every((a) => isHttpDisplayUrl(a.displayUrl))
    ) {
      return { assets, sourceKind: 'remote-bed' }
    }
    return { assets }
  } catch {
    return { assets: [] }
  }
}

async function loadRemoteAssetsFromManifestTauri(rootPath: string): Promise<{
  assets: AssetEntry[]
  sourceKind?: 'remote-bed'
}> {
  const { join } = await import('@tauri-apps/api/path')
  const { readTextFile, exists } = await import('@tauri-apps/plugin-fs')
  const p = await join(normalizeTauriRootPath(rootPath), REMOTE_ASSETS_FILE)
  if (!(await exists(p))) return { assets: [] }
  try {
    const text = await readTextFile(p)
    return parseRemoteAssetsSidecar(text)
  } catch {
    return { assets: [] }
  }
}

async function loadRemoteAssetsFromManifestHandle(
  folderHandle: FileSystemDirectoryHandle
): Promise<{ assets: AssetEntry[]; sourceKind?: 'remote-bed' }> {
  try {
    const fh = await folderHandle.getFileHandle(REMOTE_ASSETS_FILE, { create: false })
    const file = await fh.getFile()
    const text = await file.text()
    return parseRemoteAssetsSidecar(text)
  } catch {
    return { assets: [] }
  }
}

async function writeRemoteAssetsSidecar(
  access: LiveFolderAccess,
  remoteSourceAssets: AssetEntry[] | undefined
): Promise<void> {
  if (!remoteSourceAssets?.length) return
  const httpAssets = remoteSourceAssets.filter((a) => isHttpDisplayUrl(a.displayUrl))
  if (httpAssets.length === 0) return
  const body = JSON.stringify(
    { version: 2, kind: 'remote-bed' as const, assets: httpAssets },
    null,
    2
  )
  if (access.kind === 'tauri') {
    const { join } = await import('@tauri-apps/api/path')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(
      await join(normalizeTauriRootPath(access.rootPath), REMOTE_ASSETS_FILE),
      new TextEncoder().encode(body)
    )
    return
  }
  const root = access.handle
  const fh = await root.getFileHandle(REMOTE_ASSETS_FILE, { create: true })
  const w = await fh.createWritable()
  await w.write(body)
  await w.close()
}

/**
 * 在父目录下新建去重后的项目文件夹、Svg_replace、config.json，并写入内存中的替换图（仅 blob 预览可落盘）。
 */
export async function createRemoteAnalysisBundleTauri(
  parentPath: string,
  bundleDisplayName: string,
  sections: CategorySection[],
  itemsBySection: Record<string, ReplacementItem[]>,
  remoteSourceAssets: AssetEntry[]
): Promise<{ rootPath: string }> {
  if (!isTauri()) throw new Error('仅桌面版支持导出图床分组')
  const { join } = await import('@tauri-apps/api/path')
  const { mkdir, writeFile, exists } = await import('@tauri-apps/plugin-fs')
  const parent = normalizeTauriRootPath(parentPath)
  const base = sanitizeBundleDirName(bundleDisplayName)
  let candidate = await join(parent, base)
  let n = 0
  while (await exists(candidate)) {
    n += 1
    candidate = await join(parent, `${base}_${n}`)
  }
  await mkdir(candidate, { recursive: true })
  const svgReplace = await getSvgReplacePathForWriteTauri(candidate)

  const used = new Set<string>()
  function allocateDiskName(orig: string): string {
    let disk = orig.replace(/[/\\?*:]/g, '_').trim()
    if (!disk) disk = `file_${Date.now()}`
    if (!used.has(disk)) {
      used.add(disk)
      return disk
    }
    const dot = disk.lastIndexOf('.')
    const stem = dot > 0 ? disk.slice(0, dot) : disk
    const ext = dot > 0 ? disk.slice(dot) : ''
    let i = 1
    let next = `${stem}_${i}${ext}`
    while (used.has(next)) {
      i += 1
      next = `${stem}_${i}${ext}`
    }
    used.add(next)
    return next
  }

  const newReplacements: Record<string, string[]> = {}
  for (const [sectionId, items] of Object.entries(itemsBySection)) {
    if (!items?.length) continue
    const names: string[] = []
    for (const item of items) {
      if (!item.previewUrl?.startsWith('blob:')) continue
      const diskName = allocateDiskName(item.filename)
      const buf = new Uint8Array(await (await fetch(item.previewUrl)).arrayBuffer())
      await writeFile(await join(svgReplace, diskName), buf)
      names.push(diskName)
    }
    if (names.length) newReplacements[sectionId] = names
  }

  const payload = { sections, replacements: newReplacements }
  await writeFile(
    await join(svgReplace, SVG_REPLACE_CONFIG_FILE),
    new TextEncoder().encode(JSON.stringify(payload, null, 2))
  )
  await writeRemoteAssetsSidecar({ kind: 'tauri', rootPath: candidate }, remoteSourceAssets)
  return { rootPath: candidate }
}

/**
 * 向已有项目根 handle 写入 analysis-folders 配置（用于选择文件夹后追加并保存）
 */
export async function writeAnalysisFoldersToHandle(
  rootHandle: FileSystemDirectoryHandle,
  folderNames: string[]
): Promise<void> {
  let dataDir: FileSystemDirectoryHandle
  try {
    dataDir = await rootHandle.getDirectoryHandle(DATA_DIR, { create: false })
  } catch {
    dataDir = await rootHandle.getDirectoryHandle(DATA_DIR, { create: true })
  }
  const fileHandle = await dataDir.getFileHandle(ANALYSIS_FOLDERS_FILE, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify({ folderNames }, null, 2))
  await writable.close()
}

/**
 * 从项目根 handle 读取当前已配置的文件夹列表
 */
export async function readAnalysisFoldersFromHandle(
  rootHandle: FileSystemDirectoryHandle
): Promise<string[]> {
  try {
    const dataDir = await rootHandle.getDirectoryHandle(DATA_DIR, { create: false })
    const fileHandle = await dataDir.getFileHandle(ANALYSIS_FOLDERS_FILE, { create: false })
    const file = await fileHandle.getFile()
    const data = JSON.parse(await file.text()) as AnalysisFoldersConfig
    return data.folderNames ?? []
  } catch (_) {
    return []
  }
}

/**
 * 从给定的文件夹 handle 递归读取所有层级资源（用于直接选择文件夹后的即时展示）
 */
export async function readFolderContentFromHandle(
  folderHandle: FileSystemDirectoryHandle,
  folderName: string,
  folderId: string
): Promise<FolderManifest> {
  const assets: AssetEntry[] = []
  const usedIds = new Set<string>()

  function ensureUniqueId(baseId: string): string {
    let id = baseId
    let n = 0
    while (usedIds.has(id)) {
      n += 1
      id = `${baseId}--${n}`
    }
    usedIds.add(id)
    return id
  }

  async function walk(
    dir: FileSystemDirectoryHandle,
    relPrefix: string
  ): Promise<void> {
    for await (const [name, handle] of (dir as any).entries()) {
      const rel = relPrefix ? `${relPrefix}/${name}` : name
      if (handle.kind === 'directory') {
        if (name === SVG_REPLACE_DIR_NAME) {
          continue
        }
        /** .imageset 按普通目录递归：内部每个文件各一条素材（与 Xcode 资产目录「合一」语义不同） */
        await walk(handle as FileSystemDirectoryHandle, rel)
      } else if (handle.kind === 'file') {
        if (name === REMOTE_ASSETS_FILE) continue
        const ext =
          name.includes('.') && name.lastIndexOf('.') > 0
            ? name.slice(name.lastIndexOf('.')).toLowerCase()
            : ''
        const format = inferFormat(name)
        const baseName = ext ? name.slice(0, -ext.length) : name
        const assetName = baseName || name
        let displayUrl: string | undefined
        let size: number | undefined
        try {
          const file = await (handle as FileSystemFileHandle).getFile()
          size = file.size
          if (PREVIEW_IMAGE_EXTS.has(ext)) {
            displayUrl = URL.createObjectURL(file)
          }
        } catch (_) {}
        const baseId = `${folderId}-${rel.replace(/[/\\]/g, '_')}`
        const uniqueId = ensureUniqueId(baseId)
        assets.push({
          id: uniqueId,
          name: assetName,
          path: rel,
          format,
          images: [{ filename: name }],
          displayUrl,
          imagePreviewable: !!displayUrl,
          size,
        })
      }
    }
  }

  const remoteListed = await loadRemoteAssetsFromManifestHandle(folderHandle)
  for (const a of remoteListed.assets) {
    usedIds.add(a.id)
    assets.push(a)
  }

  await walk(folderHandle, '')
  return {
    id: folderId,
    name: folderName,
    assets,
    ...(remoteListed.sourceKind ? { sourceKind: remoteListed.sourceKind } : {}),
  }
}

async function readFolderContentFromTauriRoot(
  rootPath: string,
  folderName: string,
  folderId: string
): Promise<FolderManifest> {
  const { readDir, readFile } = await import('@tauri-apps/plugin-fs')
  const { join } = await import('@tauri-apps/api/path')
  const root = normalizeTauriRootPath(rootPath)
  const assets: AssetEntry[] = []
  const usedIds = new Set<string>()

  function ensureUniqueId(baseId: string): string {
    let id = baseId
    let n = 0
    while (usedIds.has(id)) {
      n += 1
      id = `${baseId}--${n}`
    }
    usedIds.add(id)
    return id
  }

  async function walkDir(dirPath: string, relPrefix: string): Promise<void> {
    const entries = await readDir(dirPath)
    for (const entry of entries) {
      const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name
      if (entry.isDirectory) {
        if (isSvgReplaceFolderName(entry.name)) continue
        await walkDir(await join(dirPath, entry.name), rel)
      } else if (entry.isFile) {
        const name = entry.name
        if (name === REMOTE_ASSETS_FILE) continue
        const ext =
          name.includes('.') && name.lastIndexOf('.') > 0
            ? name.slice(name.lastIndexOf('.')).toLowerCase()
            : ''
        const format = inferFormat(name)
        const baseName = ext ? name.slice(0, -ext.length) : name
        const assetName = baseName || name
        let displayUrl: string | undefined
        let size: number | undefined
        try {
          const buf = await readFile(await join(dirPath, name))
          size = buf.byteLength
          if (PREVIEW_IMAGE_EXTS.has(ext)) {
            const mime =
              ext === '.svg'
                ? 'image/svg+xml'
                : ext === '.png'
                  ? 'image/png'
                  : ext === '.jpg' || ext === '.jpeg'
                    ? 'image/jpeg'
                    : ext === '.webp'
                      ? 'image/webp'
                      : ext === '.gif'
                        ? 'image/gif'
                        : 'application/octet-stream'
            displayUrl = URL.createObjectURL(new Blob([buf], { type: mime }))
          }
        } catch (_) {}
        const baseId = `${folderId}-${rel.replace(/[/\\]/g, '_')}`
        const uniqueId = ensureUniqueId(baseId)
        assets.push({
          id: uniqueId,
          name: assetName,
          path: rel,
          format,
          images: [{ filename: name }],
          displayUrl,
          imagePreviewable: !!displayUrl,
          size,
        })
      }
    }
  }

  const remoteListed = await loadRemoteAssetsFromManifestTauri(root)
  for (const a of remoteListed.assets) {
    usedIds.add(a.id)
    assets.push(a)
  }

  await walkDir(root, '')
  return {
    id: folderId,
    name: folderName,
    assets,
    ...(remoteListed.sourceKind ? { sourceKind: remoteListed.sourceKind } : {}),
  }
}

export async function readFolderContentFromAccess(
  access: LiveFolderAccess,
  folderName: string,
  folderId: string
): Promise<FolderManifest> {
  if (access.kind === 'fsa') {
    return readFolderContentFromHandle(access.handle, folderName, folderId)
  }
  return readFolderContentFromTauriRoot(access.rootPath, folderName, folderId)
}

/**
 * 通过 FSA 递归读取指定文件夹下所有层级资源（需项目根 handle + 文件夹名）
 */
export async function readFolderContentViaFSA(
  rootHandle: FileSystemDirectoryHandle,
  folderName: string,
  folderId: string
): Promise<FolderManifest> {
  const folderHandle = await rootHandle.getDirectoryHandle(folderName, { create: false })
  return readFolderContentFromHandle(folderHandle, folderName, folderId)
}

/**
 * 从分析文件夹 handle 下读取 Svg_replace/config.json（若有），用于添加文件夹时恢复分组与替换映射
 */
export async function readFolderConfigFromHandle(
  folderHandle: FileSystemDirectoryHandle
): Promise<{ sections: CategorySection[]; replacements: Record<string, string[]> } | null> {
  try {
    const svgReplace = await findSvgReplaceDirectory(folderHandle)
    if (!svgReplace) return null
    const fileHandle = await svgReplace.getFileHandle(SVG_REPLACE_CONFIG_FILE, { create: false })
    const file = await fileHandle.getFile()
    const data = JSON.parse(await file.text()) as { sections?: CategorySection[]; replacements?: Record<string, string | string[]> }
    const sections = Array.isArray(data.sections) ? data.sections : []
    const replacements: Record<string, string[]> = {}
    if (data.replacements && typeof data.replacements === 'object') {
      for (const [sectionId, val] of Object.entries(data.replacements)) {
        replacements[sectionId] = Array.isArray(val) ? val : val ? [val] : []
      }
    }
    return { sections, replacements }
  } catch (_) {
    return null
  }
}

async function readFolderConfigFromTauriRoot(
  rootPath: string
): Promise<{ sections: CategorySection[]; replacements: Record<string, string[]> } | null> {
  try {
    const svgReplacePath = await findSvgReplacePathTauri(rootPath)
    if (!svgReplacePath) return null
    const { join } = await import('@tauri-apps/api/path')
    const { readTextFile } = await import('@tauri-apps/plugin-fs')
    const text = await readTextFile(await join(svgReplacePath, SVG_REPLACE_CONFIG_FILE))
    const data = JSON.parse(text) as { sections?: CategorySection[]; replacements?: Record<string, string | string[]> }
    const sections = Array.isArray(data.sections) ? data.sections : []
    const replacements: Record<string, string[]> = {}
    if (data.replacements && typeof data.replacements === 'object') {
      for (const [sectionId, val] of Object.entries(data.replacements)) {
        replacements[sectionId] = Array.isArray(val) ? val : val ? [val] : []
      }
    }
    return { sections, replacements }
  } catch (_) {
    return null
  }
}

export async function readFolderConfigFromAccess(
  access: LiveFolderAccess
): Promise<{ sections: CategorySection[]; replacements: Record<string, string[]> } | null> {
  if (access.kind === 'fsa') return readFolderConfigFromHandle(access.handle)
  return readFolderConfigFromTauriRoot(access.rootPath)
}

/**
 * 从 Svg_replace 目录读取替换图文件并生成预览 URL，用于加载 config 后显示图片预览
 */
export async function loadReplacementPreviewsFromHandle(
  folderHandle: FileSystemDirectoryHandle,
  replacements: Record<string, string[]>
): Promise<Record<string, ReplacementItem[]>> {
  const result: Record<string, ReplacementItem[]> = {}
  const svgReplace = await findSvgReplaceDirectory(folderHandle)
  if (!svgReplace) return result
  for (const [sectionId, filenames] of Object.entries(replacements)) {
    const items: ReplacementItem[] = []
    for (let i = 0; i < (filenames || []).length; i++) {
      const filename = filenames[i]
      const item: ReplacementItem = {
        id: `rep_loaded_${sectionId}_${i}`,
        filename,
      }
      try {
        const fileHandle = await svgReplace.getFileHandle(filename, { create: false })
        const file = await fileHandle.getFile()
        item.previewUrl = URL.createObjectURL(file)
        item.isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(filename)
        item.size = file.size
      } catch (_) {
        /* 文件不存在或无法读取时仅保留 filename，无预览 */
      }
      items.push(item)
    }
    result[sectionId] = items
  }
  return result
}

function mimeForReplacementFilename(filename: string): string {
  const lower = filename.toLowerCase()
  if (lower.endsWith('.svg')) return 'image/svg+xml'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  return 'application/octet-stream'
}

async function loadReplacementPreviewsFromTauriRoot(
  rootPath: string,
  replacements: Record<string, string[]>
): Promise<Record<string, ReplacementItem[]>> {
  const result: Record<string, ReplacementItem[]> = {}
  const svgReplacePath = await findSvgReplacePathTauri(rootPath)
  if (!svgReplacePath) return result
  const { readFile } = await import('@tauri-apps/plugin-fs')
  const { join } = await import('@tauri-apps/api/path')
  for (const [sectionId, filenames] of Object.entries(replacements)) {
    const items: ReplacementItem[] = []
    for (let i = 0; i < (filenames || []).length; i++) {
      const filename = filenames[i]
      const item: ReplacementItem = {
        id: `rep_loaded_${sectionId}_${i}`,
        filename,
      }
      try {
        const buf = await readFile(await join(svgReplacePath, filename))
        const mime = mimeForReplacementFilename(filename)
        item.previewUrl = URL.createObjectURL(new Blob([buf], { type: mime }))
        item.isSvg = mime === 'image/svg+xml' || /\.svg$/i.test(filename)
        item.size = buf.byteLength
      } catch (_) {
        /* 文件不存在或无法读取时仅保留 filename，无预览 */
      }
      items.push(item)
    }
    result[sectionId] = items
  }
  return result
}

export async function loadReplacementPreviewsFromAccess(
  access: LiveFolderAccess,
  replacements: Record<string, string[]>
): Promise<Record<string, ReplacementItem[]>> {
  if (access.kind === 'fsa') {
    return loadReplacementPreviewsFromHandle(access.handle, replacements)
  }
  return loadReplacementPreviewsFromTauriRoot(access.rootPath, replacements)
}

/**
 * 将当前分析文件夹的分组配置与替换图映射保存到该文件夹下的 Svg_replace/config.json；无 Svg_replace 则自动创建。
 * 若传入 access 则直接在该目录下创建 Svg_replace，不再弹窗让用户选择。
 */
/** 保存时 replacements 为 sectionId -> 文件名数组（多张） */
export async function saveFolderConfigToSvgReplace(
  folderName: string,
  payload: { sections: CategorySection[]; replacements: Record<string, string | string[]> },
  access?: LiveFolderAccess,
  remoteSourceAssets?: AssetEntry[]
): Promise<void> {
  if (access?.kind === 'tauri') {
    const svgReplace = await getSvgReplacePathForWriteTauri(access.rootPath)
    const { join } = await import('@tauri-apps/api/path')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    await writeFile(
      await join(svgReplace, SVG_REPLACE_CONFIG_FILE),
      new TextEncoder().encode(JSON.stringify(payload, null, 2))
    )
    await writeRemoteAssetsSidecar(access, remoteSourceAssets)
    return
  }

  if (!checkFSA()) throw new Error('当前浏览器不支持文件系统访问')

  let target: FileSystemDirectoryHandle
  if (access?.kind === 'fsa') {
    target = access.handle
  } else {
    if (isTauri()) {
      throw new Error('请使用顶部「选择文件夹」添加分析目录后再保存')
    }
    const rootHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    target = await rootHandle.getDirectoryHandle(folderName, { create: false })
  }
  const svgReplace = await getSvgReplaceForWrite(target)
  const fileHandle = await svgReplace.getFileHandle(SVG_REPLACE_CONFIG_FILE, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify(payload, null, 2))
  await writable.close()
  if (access?.kind === 'fsa') {
    await writeRemoteAssetsSidecar(access, remoteSourceAssets)
  }
}

/**
 * 将替换图写入指定分析文件夹下的 Svg_replace 目录。若传入 access 则直接在该目录下创建，不再弹窗。
 * 写入前会请求 readwrite 权限，避免 createWritable 静默失败或抛 NotAllowedError。
 */
export async function saveReplacementFile(
  folderName: string,
  file: File,
  preferredName?: string,
  access?: LiveFolderAccess
): Promise<string> {
  if (access?.kind === 'tauri') {
    const svgReplace = await getSvgReplacePathForWriteTauri(access.rootPath)
    const { join } = await import('@tauri-apps/api/path')
    const { writeFile } = await import('@tauri-apps/plugin-fs')
    const name = preferredName || file.name
    const safeName = name.replace(/[/\\?*:]/g, '_')
    await writeFile(await join(svgReplace, safeName), new Uint8Array(await file.arrayBuffer()))
    return safeName
  }

  if (!checkFSA()) throw new Error('当前浏览器不支持文件系统访问')

  let target: FileSystemDirectoryHandle
  if (access?.kind === 'fsa') {
    target = access.handle
    if (typeof (target as any).requestPermission === 'function') {
      const state = await (target as any).requestPermission({ mode: 'readwrite' })
      if (state === 'denied') throw new Error('没有写入该文件夹的权限，请在弹窗中允许访问')
    }
  } else {
    if (isTauri()) {
      throw new Error('请使用顶部「选择文件夹」添加分析目录后再上传')
    }
    const rootHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    target = await rootHandle.getDirectoryHandle(folderName, { create: false })
  }
  const svgReplace = await getSvgReplaceForWrite(target)
  const name = preferredName || file.name
  const safeName = name.replace(/[/\\?*:]/g, '_')
  const fileHandle = await svgReplace.getFileHandle(safeName, { create: true })
  const writable = await fileHandle.createWritable({ keepExistingData: false })
  await writable.write(await file.arrayBuffer())
  await writable.close()
  return safeName
}

/**
 * 从分析文件夹下的 Svg_replace 目录中删除指定替换图文件。
 * 需传入 access（且 FSA 需具备 readwrite 权限）。若 remove 不存在则仅跳过删除。
 */
export async function deleteReplacementFile(access: LiveFolderAccess, filename: string): Promise<void> {
  if (access.kind === 'tauri') {
    const svgReplacePath = await findSvgReplacePathTauri(access.rootPath)
    if (!svgReplacePath) return
    const { join } = await import('@tauri-apps/api/path')
    const { remove } = await import('@tauri-apps/plugin-fs')
    try {
      await remove(await join(svgReplacePath, filename))
    } catch (_) {}
    return
  }

  if (!checkFSA()) return
  const folderHandle = access.handle
  if (typeof (folderHandle as any).requestPermission === 'function') {
    const state = await (folderHandle as any).requestPermission({ mode: 'readwrite' })
    if (state === 'denied') throw new Error('没有写入该文件夹的权限')
  }
  const svgReplace = await findSvgReplaceDirectory(folderHandle)
  if (!svgReplace) return
  const fileHandle = await svgReplace.getFileHandle(filename, { create: false })
  if (typeof (fileHandle as any).remove === 'function') {
    await (fileHandle as any).remove()
  }
}

/**
 * 从 analysis-folders.json 中移除指定文件夹名（会弹窗让用户选择项目根）
 */
export async function removeFolderFromAnalysisConfig(folderName: string): Promise<void> {
  if (!checkFSA()) throw new Error('当前浏览器不支持文件系统访问')
  const rootHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  const current = await readAnalysisFoldersFromHandle(rootHandle)
  const next = current.filter((n) => n !== folderName)
  await writeAnalysisFoldersToHandle(rootHandle, next)
}

export function isFSASupported(): boolean {
  return checkFSA() || isTauri()
}
