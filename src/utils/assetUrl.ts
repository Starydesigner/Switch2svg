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
