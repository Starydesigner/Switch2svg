import type { AssetEntry } from '../types'
import { assetHasImagePreview, getAssetImageUrl } from '../utils/assetUrl'
import { AssetThumbPlaceholder } from './AssetThumbPlaceholder'
import { SvgImage, isSvgFile } from './SvgImage'
import './AssetCard.css'

interface AssetCardDragPreviewProps {
  asset: AssetEntry
}

/** 用于 DragOverlay 的预览卡片，与 SortableAssetCard 视觉一致，保证拖拽时始终可见 */
export function AssetCardDragPreview({ asset }: AssetCardDragPreviewProps) {
  return (
    <div className="asset-card dragging">
      <div className="asset-card-thumb">
        {asset.format === 'lottie' ? (
          <span className="thumb-placeholder">Lottie</span>
        ) : !assetHasImagePreview(asset) ? (
          <AssetThumbPlaceholder />
        ) : isSvgFile(asset.path, asset.format) ? (
          <SvgImage src={getAssetImageUrl(asset)} alt={asset.name} draggable={false} />
        ) : (
          <img src={getAssetImageUrl(asset)} alt={asset.name} draggable={false} />
        )}
        <span className="thumb-placeholder" style={{ display: 'none' }}>?</span>
        <span className="asset-card-format-tag">{(asset.format || 'png').toUpperCase()}</span>
      </div>
      <span className="asset-card-name">{asset.name}</span>
    </div>
  )
}
