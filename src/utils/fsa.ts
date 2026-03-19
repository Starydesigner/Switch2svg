import type { AnalysisFoldersConfig, AssetEntry, FolderManifest, ReplacementItem } from '../types'
import type { CategorySection } from './categories'

const FLAT_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.json']
function inferFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (ext === 'json') return 'lottie'
  if (ext === 'webp') return 'webp'
  if (ext === 'gif') return 'gif'
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg'
  return ext || 'png'
}

const DATA_DIR = 'switch2svg-data'
const ANALYSIS_FOLDERS_FILE = 'analysis-folders.json'
const SVG_REPLACE_CONFIG_FILE = 'config.json'

function checkFSA(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
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
    return await root.getDirectoryHandle('Svg_replace', { create: false })
  } catch (_) {}

  async function walk(dir: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> {
    for await (const [name, entry] of (dir as any).entries()) {
      if (entry.kind !== 'directory') continue
      const child = entry as FileSystemDirectoryHandle
      if (name === 'Svg_replace') return child
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
  return await root.getDirectoryHandle('Svg_replace', { create: true })
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
 */
export async function pickAnalysisFolderDirect(): Promise<{
  folderHandle: FileSystemDirectoryHandle
  folderName: string
}> {
  if (!checkFSA()) throw new Error('当前浏览器不支持文件系统访问')
  const folderHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  return { folderHandle, folderName: folderHandle.name }
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

  async function walk(
    dir: FileSystemDirectoryHandle,
    relPrefix: string
  ): Promise<void> {
    for await (const [name, handle] of (dir as any).entries()) {
      const rel = relPrefix ? `${relPrefix}/${name}` : name
      if (handle.kind === 'directory') {
        if (name.endsWith('.imageset')) {
          try {
            const contentsHandle = await handle.getFileHandle('Contents.json', { create: false })
            const file = await contentsHandle.getFile()
            const contents = JSON.parse(await file.text()) as { images?: { scale?: string; filename: string }[] }
            const images = (contents.images || [])
              .filter((img) => img.filename)
              .map((img) => ({ scale: img.scale, filename: img.filename }))
            const firstFile = images[0]?.filename
            const format = firstFile ? inferFormat(firstFile) : 'png'
            const assetName = name.replace(/\.imageset$/, '')
            let displayUrl: string | undefined
            let size: number | undefined
            if (firstFile) {
              try {
                const imgHandle = await handle.getFileHandle(firstFile, { create: false })
                const imgFile = await imgHandle.getFile()
                displayUrl = URL.createObjectURL(imgFile)
                size = imgFile.size
              } catch (_) {}
            }
            const uniqueId = `${folderId}-${rel.replace(/[/\\]/g, '_')}`
            assets.push({
              id: uniqueId,
              name: assetName,
              path: rel,
              format,
              images,
              displayUrl,
              size,
            })
          } catch (_) {}
        } else {
          await walk(handle as FileSystemDirectoryHandle, rel)
        }
      } else if (handle.kind === 'file') {
        const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : ''
        if (FLAT_EXTS.includes(ext)) {
          const format = inferFormat(name)
          const assetName = name.replace(/\.[^.]+$/, '')
          let displayUrl: string | undefined
          let size: number | undefined
          try {
            const file = await (handle as FileSystemFileHandle).getFile()
            size = file.size
            if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext)) {
              displayUrl = URL.createObjectURL(file)
            }
          } catch (_) {}
          const uniqueId = `${folderId}-${rel.replace(/[/\\]/g, '_')}`
          assets.push({
            id: uniqueId,
            name: assetName,
            path: rel,
            format,
            images: [{ filename: name }],
            displayUrl,
            size,
          })
        }
      }
    }
  }

  await walk(folderHandle, '')
  return { id: folderId, name: folderName, assets }
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

/**
 * 将当前分析文件夹的分组配置与替换图映射保存到该文件夹下的 Svg_replace/config.json；无 Svg_replace 则自动创建。
 * 若传入 folderHandle 则直接在该目录下创建 Svg_replace，不再弹窗让用户选择。
 */
/** 保存时 replacements 为 sectionId -> 文件名数组（多张） */
export async function saveFolderConfigToSvgReplace(
  folderName: string,
  payload: { sections: CategorySection[]; replacements: Record<string, string | string[]> },
  folderHandle?: FileSystemDirectoryHandle
): Promise<void> {
  if (!checkFSA()) throw new Error('当前浏览器不支持文件系统访问')
  let target: FileSystemDirectoryHandle
  if (folderHandle) {
    target = folderHandle
  } else {
    const rootHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
    target = await rootHandle.getDirectoryHandle(folderName, { create: false })
  }
  const svgReplace = await getSvgReplaceForWrite(target)
  const fileHandle = await svgReplace.getFileHandle(SVG_REPLACE_CONFIG_FILE, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify(payload, null, 2))
  await writable.close()
}

/**
 * 将替换图写入指定分析文件夹下的 Svg_replace 目录。若传入 folderHandle 则直接在该目录下创建，不再弹窗。
 * 写入前会请求 readwrite 权限，避免 createWritable 静默失败或抛 NotAllowedError。
 */
export async function saveReplacementFile(
  folderName: string,
  file: File,
  preferredName?: string,
  folderHandle?: FileSystemDirectoryHandle
): Promise<string> {
  if (!checkFSA()) throw new Error('当前浏览器不支持文件系统访问')
  let target: FileSystemDirectoryHandle
  if (folderHandle) {
    target = folderHandle
    if (typeof (target as any).requestPermission === 'function') {
      const state = await (target as any).requestPermission({ mode: 'readwrite' })
      if (state === 'denied') throw new Error('没有写入该文件夹的权限，请在弹窗中允许访问')
    }
  } else {
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
 * 需传入 folderHandle（且需具备 readwrite 权限）。若 remove 不存在则仅跳过删除。
 */
export async function deleteReplacementFile(
  folderHandle: FileSystemDirectoryHandle,
  filename: string
): Promise<void> {
  if (!checkFSA()) return
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
  return checkFSA()
}
