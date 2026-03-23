import type { ImgHTMLAttributes } from 'react'
import type { AssetEntry } from '../types'

const BASE = ''

/**
 * 是否应用 <img> / SvgImage 预览（FSA 下无 blob 的素材应为 false，避免无效 URL）
 */
export function assetHasImagePreview(asset: AssetEntry): boolean {
  if (asset.imagePreviewable === false) return false
  if (asset.imagePreviewable === true) return true
  const f = (asset.format || '').toLowerCase()
  if (f === 'lottie' || f === 'json' || f === 'pdf') return false
  return true
}

/**
 * 获取用于展示的图片 URL（FSA 实时读取时优先 displayUrl）
 * - 旧清单：path 以 `.imageset` 结尾表示整包，用 images 里 @2x 等拼子路径
 * - FSA 逐文件：path 为 `xxx.imageset/具体文件`，走单层 path，避免误拼成双路径
 */
/** 是否为网络直链素材（用于图床分组 UI：链接图标、复制地址等） */
export function isHttpImageAsset(asset: AssetEntry): boolean {
  const u = asset.displayUrl || ''
  return /^https?:\/\//i.test(u)
}

const IMAGE_LISTING_FORMATS = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'svg',
  'bmp',
  'ico',
  'avif',
  'heic',
  'heif',
  'tif',
  'tiff',
])

/** 网格/搜索中视为「图片类」；勾选「隐藏非图片」时保留（排除 json、pdf、lottie 等） */
export function isImageListingAsset(asset: AssetEntry): boolean {
  if (isHttpImageAsset(asset)) return true
  if (asset.imagePreviewable === false) return false
  const f = (asset.format || '').toLowerCase()
  if (IMAGE_LISTING_FORMATS.has(f)) return true
  if (asset.imagePreviewable === true) return true
  return false
}

/** 多选复制到剪贴板：图床模式优先写 https 地址，否则写「名称.扩展名」 */
export function buildSelectedAssetsClipboardText(
  selectedIds: Iterable<string>,
  assetsById: Map<string, AssetEntry>,
  remoteBedStyle: boolean
): string {
  const lines: string[] = []
  for (const id of selectedIds) {
    const a = assetsById.get(id)
    if (!a) continue
    if (remoteBedStyle) {
      if (isHttpImageAsset(a)) lines.push(a.displayUrl!.trim())
      else lines.push(a.format ? `${a.name}.${a.format}` : a.name)
      continue
    }
    if (!a.name) continue
    lines.push(a.format ? `${a.name}.${a.format}` : a.name)
  }
  return lines.filter(Boolean).join('\n')
}

/** 缩略图/预览 URL 是否为 http(s) 直链（Tauri WebView 下应对其避免 native lazy 等兼容问题） */
export function isRemoteHttpThumbnailUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim())
}

/** 远程 http(s) 缩略图：避免向图床发送 tauri.localhost 来源，减少防盗链误判 */
export function remoteHttpImageProps(
  src: string
): Pick<ImgHTMLAttributes<HTMLImageElement>, 'referrerPolicy'> {
  return isRemoteHttpThumbnailUrl(src) ? { referrerPolicy: 'no-referrer' } : {}
}

export function getAssetImageUrl(asset: AssetEntry): string {
  if (asset.displayUrl) return asset.displayUrl
  const normalized = asset.path.replace(/\\/g, '/')
  const isImagesetBundleRoot = /\.imageset$/i.test(normalized)
  if (isImagesetBundleRoot) {
    const preferred = asset.images.find((i) => i.scale === '2x') || asset.images[0]
    if (!preferred) return ''
    return `${BASE}/${encodePath(asset.path)}/${encodeURIComponent(preferred.filename)}`
  }
  return `${BASE}/${encodePath(asset.path)}`
}

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}
