import type { AssetEntry } from '../types'

const BASE = ''

/**
 * 获取用于展示的图片 URL（FSA 实时读取时优先 displayUrl；否则优先 @2x；imageset 为 path + filename，否则 path 即文件路径）
 */
export function getAssetImageUrl(asset: AssetEntry): string {
  if (asset.displayUrl) return asset.displayUrl
  if (asset.path.includes('.imageset')) {
    const preferred = asset.images.find((i) => i.scale === '2x') || asset.images[0]
    if (!preferred) return ''
    return `${BASE}/${encodePath(asset.path)}/${encodeURIComponent(preferred.filename)}`
  }
  return `${BASE}/${encodePath(asset.path)}`
}

function encodePath(p: string): string {
  return p.split('/').map(encodeURIComponent).join('/')
}
