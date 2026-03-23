import { useState } from 'react'
import { Check, GripVertical } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { AssetEntry } from '../types'
import {
  assetHasImagePreview,
  isRemoteHttpThumbnailUrl,
  remoteHttpImageProps,
} from '../utils/assetUrl'
import { useRemotePreviewSrc } from '../utils/remoteHttpPreview'
import { AssetThumbPlaceholder } from './AssetThumbPlaceholder'
import { SvgImage, isSvgFile } from './SvgImage'
import './AssetCard.css'

interface SortableAssetCardProps {
  asset: AssetEntry
  isSelected?: boolean
  onSelect?: (assetId: string) => void
  /** 双击或空格时全屏放大预览 */
  onPreview?: (asset: AssetEntry) => void
}

export function SortableAssetCard({ asset, isSelected, onSelect, onPreview }: SortableAssetCardProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: asset.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const handleCheckClick = (e: React.MouseEvent) => {
    if (!onSelect) return
    e.preventDefault()
    e.stopPropagation()
    onSelect(asset.id)
  }

  const handleCardClick = (e: React.MouseEvent) => {
    if (!onSelect) return
    if ((e.target as HTMLElement).closest('.asset-card-drag-handle')) return
    onSelect(asset.id)
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.asset-card-drag-handle')) return
    onPreview?.(asset)
  }

  const { src: thumbSrc, pending: thumbPending, failed: thumbFailed } = useRemotePreviewSrc(asset)
  const remoteHttpThumb = isRemoteHttpThumbnailUrl(asset.displayUrl || thumbSrc)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault()
      if (onPreview) onPreview(asset)
      else if (onSelect) onSelect(asset.id)
    } else if (e.key === 'Enter' && onSelect) {
      e.preventDefault()
      onSelect(asset.id)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`asset-card ${isDragging ? 'dragging dragging-in-place' : ''} ${isSelected ? 'selected' : ''}`}
      onClick={handleCardClick}
      onDoubleClick={handleDoubleClick}
      role={onSelect || onPreview ? 'button' : undefined}
      tabIndex={onSelect || onPreview ? 0 : undefined}
      aria-label={onSelect ? (isSelected ? '取消选中' : '选中') : undefined}
      onKeyDown={(onSelect || onPreview) ? handleKeyDown : undefined}
    >
      {listeners && typeof listeners === 'object' && (
        <span
          className="asset-card-drag-handle"
          title="按住拖动"
          aria-label="拖动"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={12} strokeWidth={2} />
        </span>
      )}
      {onSelect && (
        <span
          className="asset-card-select-check"
          role="button"
          tabIndex={0}
          aria-label={isSelected ? '取消选中' : '选中'}
          title={isSelected ? '取消选中' : '点击选中（可多选）'}
          onClick={handleCheckClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              onSelect(asset.id)
            }
          }}
        >
          {isSelected ? <Check size={10} strokeWidth={3} color="white" /> : null}
        </span>
      )}
      <div className="asset-card-thumb">
        {asset.format === 'lottie' ? (
          <span className="thumb-placeholder">Lottie</span>
        ) : !assetHasImagePreview(asset) ? (
          <AssetThumbPlaceholder />
        ) : thumbPending ? (
          <AssetThumbPlaceholder />
        ) : thumbFailed ? (
          <span className="thumb-placeholder">?</span>
        ) : (isSvgFile(asset.path, asset.format) ? (
          <SvgImage
            src={thumbSrc}
            alt={asset.name}
            {...remoteHttpImageProps(asset.displayUrl || thumbSrc)}
            loading={remoteHttpThumb ? 'eager' : 'lazy'}
            onLoad={(e) => {
              const img = e.currentTarget
              if (img.naturalWidth && img.naturalHeight) {
                setSize({ w: img.naturalWidth, h: img.naturalHeight })
              }
            }}
            onError={(e) => {
              const wrap = e.currentTarget.closest('.svg-tint-container') as HTMLElement
              if (wrap) {
                wrap.style.display = 'none'
                const span = wrap.nextElementSibling as HTMLElement
                if (span) span.style.display = 'inline'
              }
            }}
          />
        ) : (
          <img
            src={thumbSrc}
            alt={asset.name}
            {...remoteHttpImageProps(asset.displayUrl || thumbSrc)}
            loading={remoteHttpThumb ? 'eager' : 'lazy'}
            onLoad={(e) => {
              const img = e.currentTarget
              if (img.naturalWidth && img.naturalHeight) {
                setSize({ w: img.naturalWidth, h: img.naturalHeight })
              }
            }}
            onError={(e) => {
              const el = e.currentTarget
              el.style.display = 'none'
              const span = el.nextElementSibling as HTMLElement
              if (span) span.style.display = 'inline'
            }}
          />
        ))}
        <span className="thumb-placeholder" style={{ display: 'none' }}>?</span>
        <span className="asset-card-format-tag">{(asset.format || 'png').toUpperCase()}</span>
      </div>
      <span className="asset-card-name">{asset.name}</span>
      {size && (
        <span className="asset-card-size">{size.w}×{size.h}</span>
      )}
    </div>
  )
}
