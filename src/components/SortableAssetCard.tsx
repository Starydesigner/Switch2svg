import { useState } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { AssetEntry } from '../types'
import { getAssetImageUrl } from '../utils/assetUrl'
import './AssetCard.css'

interface SortableAssetCardProps {
  asset: AssetEntry
}

export function SortableAssetCard({ asset }: SortableAssetCardProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: asset.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`asset-card ${isDragging ? 'dragging dragging-in-place' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="asset-card-thumb">
        {asset.format === 'lottie' ? (
          <span className="thumb-placeholder">Lottie</span>
        ) : (
          <img
            src={getAssetImageUrl(asset)}
            alt={asset.name}
            loading="lazy"
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
        )}
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
