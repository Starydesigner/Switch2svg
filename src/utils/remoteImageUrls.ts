import type { AssetEntry, FolderManifest } from '../types'

/** 在任意文本中匹配常见图片直链（含可选 query） */
const IMAGE_URL_RE =
  /https?:\/\/[^\s"'<>[\]{}|\\^`]+?\.(?:png|jpe?g|webp|gif|svg)(?:\?[^\s"'<>[\]{}|\\^`]*)?/gi

function shortHash(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16).padStart(8, '0').slice(0, 8)
}

function collectStringsFromJson(value: unknown, out: string[]): void {
  if (value === null || value === undefined) return
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (Array.isArray(value)) {
    for (const x of value) collectStringsFromJson(x, out)
    return
  }
  if (typeof value === 'object') {
    for (const x of Object.values(value as Record<string, unknown>)) collectStringsFromJson(x, out)
  }
}

function isImageUrlString(s: string): boolean {
  const t = s.trim()
  if (!/^https?:\/\//i.test(t)) return false
  try {
    const u = new URL(t)
    return /\.(?:png|jpe?g|webp|gif|svg)$/i.test(u.pathname)
  } catch {
    return false
  }
}

function inferFormatFromFilename(filename: string): string {
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

/** 从粘贴文本提取 URL 的结果：urls 已去重；droppedDuplicateInInputCount 为重复出现被忽略的次数 */
export interface ExtractImageUrlsResult {
  urls: string[]
  droppedDuplicateInInputCount: number
}

/**
 * 从粘贴文本中提取图片 URL：整段正则扫描 + 若为 JSON 则递归收集字符串再识别直链。
 */
export function extractImageUrlsFromTextDetailed(text: string): ExtractImageUrlsResult {
  const seen = new Set<string>()
  const ordered: string[] = []
  let droppedDuplicateInInputCount = 0

  const add = (raw: string) => {
    const u = raw.trim()
    if (!u) return
    if (seen.has(u)) {
      droppedDuplicateInInputCount += 1
      return
    }
    seen.add(u)
    ordered.push(u)
  }

  const re = new RegExp(IMAGE_URL_RE.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) add(m[0])

  const t = text.trim()
  if (
    (t.startsWith('{') && t.endsWith('}')) ||
    (t.startsWith('[') && t.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(t) as unknown
      const strings: string[] = []
      collectStringsFromJson(parsed, strings)
      for (const s of strings) {
        if (isImageUrlString(s)) add(s)
        const inner = new RegExp(IMAGE_URL_RE.source, 'gi')
        let m2: RegExpExecArray | null
        while ((m2 = inner.exec(s)) !== null) add(m2[0])
      }
    } catch {
      /* 非合法 JSON 时仅依赖上文全文正则 */
    }
  }

  return { urls: ordered, droppedDuplicateInInputCount }
}

/**
 * 从粘贴文本中提取图片 URL（仅返回去重后的列表，兼容旧调用方）。
 */
export function extractImageUrlsFromText(text: string): string[] {
  return extractImageUrlsFromTextDetailed(text).urls
}

/**
 * 将去重后的直链列表转为与本地扫描一致的 FolderManifest（displayUrl 为 https）。
 */
export function buildFolderManifestFromRemoteUrls(
  urls: string[],
  displayName: string
): FolderManifest {
  const ts = Date.now()
  const folderId = `live_remote_${ts}`
  const assets = buildRemoteAssetEntriesFromUrls(urls, folderId)
  return { id: folderId, name: displayName, assets, sourceKind: 'remote-bed' as const }
}

/**
 * 为已有远程文件夹批量生成素材条目（id 前缀使用当前 folderId，与新建标签页流程一致）。
 * @param skipUrls 已存在的 displayUrl，用于去重
 */
export function buildRemoteAssetEntriesFromUrls(
  urls: string[],
  folderId: string,
  skipUrls?: Set<string>
): AssetEntry[] {
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

  const assets: AssetEntry[] = []

  for (let index = 0; index < urls.length; index++) {
    const url = urls[index]!.trim()
    if (skipUrls?.has(url)) continue

    let path: string
    let filename: string
    try {
      const u = new URL(url)
      path = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname
      const seg = path.split('/').filter(Boolean)
      filename = seg.length ? seg[seg.length - 1]! : `image_${index}`
    } catch {
      path = url.replace(/[/\\]+/g, '_').replace(/^https?:_+/, '')
      filename = `image_${index}`
    }

    const format = inferFormatFromFilename(filename)
    const dot = filename.lastIndexOf('.')
    const assetName =
      dot > 0 ? filename.slice(0, dot) : filename || `image_${index}`
    const baseId = `${folderId}-${path.replace(/[/\\]/g, '_')}_${shortHash(url)}`
    const id = ensureUniqueId(baseId)

    assets.push({
      id,
      name: assetName,
      path: path || `remote_${index}`,
      format,
      images: [{ filename }],
      displayUrl: url,
      imagePreviewable: true,
    })
  }

  return assets
}
