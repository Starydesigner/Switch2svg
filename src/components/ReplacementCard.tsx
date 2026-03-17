import { useState, useEffect } from 'react'
import { useDraggable } from '@dnd-kit/core'
import type { ReplacementItem } from '../types'
import './ReplacementCard.css'

const REP_PREFIX = 'rep_'
const REP_SEP = '::'

export function getReplacementDragId(sectionId: string, itemId: string): string {
  return `${REP_PREFIX}${sectionId}${REP_SEP}${itemId}`
}

export function parseReplacementDragId(dragId: string): { sectionId: string; itemId: string } | null {
  if (!dragId.startsWith(REP_PREFIX)) return null
  const rest = dragId.slice(REP_PREFIX.length)
  const i = rest.indexOf(REP_SEP)
  if (i === -1) return null
  return { sectionId: rest.slice(0, i), itemId: rest.slice(i + REP_SEP.length) }
}

interface ReplacementCardProps {
  sectionId: string
  item: ReplacementItem
  onDelete: () => void
}

export function ReplacementCard({ sectionId, item, onDelete }: ReplacementCardProps) {
  const [imgError, setImgError] = useState(false)
  useEffect(() => {
    if (item.previewUrl) setImgError(false)
  }, [item.previewUrl])
  const dragId = getReplacementDragId(sectionId, item.id)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    data: { type: 'replacement' as const, sectionId, replacementId: item.id },
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`replacement-card ${isDragging ? 'dragging' : ''}`}
      {...attributes}
      {...listeners}
    >
      <div className="replacement-card-thumb">
        {item.previewUrl && !imgError ? (
          <img
            src={item.previewUrl}
            alt=""
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="replacement-card-placeholder">{item.filename}</span>
        )}
      </div>
      <span className="replacement-card-name" title={item.filename}>
        {item.filename}
      </span>
      {(item.width != null && item.height != null) && (
        <span className="replacement-card-size">{item.width}×{item.height}</span>
      )}
      <button
        type="button"
        className="replacement-card-delete"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="删除"
        aria-label="删除"
      >
        ×
      </button>
    </div>
  )
}
