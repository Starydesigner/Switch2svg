import { useState, useEffect, useMemo } from 'react'
import { X, Pencil } from 'lucide-react'
import { useDraggable } from '@dnd-kit/core'
import type { ReplacementItem } from '../types'
import { SvgImage, isSvgFile } from './SvgImage'
import { ReplacementRenameModal } from './ReplacementRenameModal'
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
  /** 同序左侧素材名，用于智能生成替换文件名（拼音，非 AI） */
  sourceNameHint?: string
  onDelete: () => void
  /** 当前文件夹下所有替换图文件名（小写），用于撞名检测 */
  replacementFilenamesLower: Set<string>
  canRename?: boolean
  onRename?: (sectionId: string, itemId: string, newFilename: string) => Promise<void>
}

export function ReplacementCard({
  sectionId,
  item,
  sourceNameHint,
  onDelete,
  replacementFilenamesLower,
  canRename,
  onRename,
}: ReplacementCardProps) {
  const [renameOpen, setRenameOpen] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [detectedSvg, setDetectedSvg] = useState(false)
  useEffect(() => {
    if (item.previewUrl) setImgError(false)
  }, [item.previewUrl])
  useEffect(() => {
    if (!item.previewUrl) {
      setDetectedSvg(false)
      return
    }
    if (item.isSvg || isSvgFile(item.filename)) {
      setDetectedSvg(true)
      return
    }
    let cancelled = false
    fetch(item.previewUrl)
      .then((r) => r.blob())
      .then((blob) => {
        if (!cancelled) setDetectedSvg(blob.type === 'image/svg+xml')
      })
      .catch(() => {
        if (!cancelled) setDetectedSvg(false)
      })
    return () => {
      cancelled = true
    }
  }, [item.previewUrl, item.filename, item.isSvg])
  const dragId = getReplacementDragId(sectionId, item.id)
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    data: { type: 'replacement' as const, sectionId, replacementId: item.id },
  })
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  const reservedLower = useMemo(() => {
    const s = new Set(replacementFilenamesLower)
    s.delete(item.filename.toLowerCase())
    return s
  }, [replacementFilenamesLower, item.filename])

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
          (item.isSvg || isSvgFile(item.filename) || detectedSvg) ? (
            <SvgImage
              src={item.previewUrl}
              alt=""
              onError={() => setImgError(true)}
            />
          ) : (
            <img
              src={item.previewUrl}
              alt=""
              onError={() => setImgError(true)}
            />
          )
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
      {canRename && onRename && (
        <button
          type="button"
          className="replacement-card-rename"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            setRenameOpen(true)
          }}
          title="按规范重命名"
          aria-label="重命名"
        >
          <Pencil size={12} strokeWidth={2} />
        </button>
      )}
      <button
        type="button"
        className="replacement-card-delete"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        title="删除"
        aria-label="删除"
      >
        <X size={12} strokeWidth={2} />
      </button>
      {renameOpen && onRename && (
        <ReplacementRenameModal
          open={renameOpen}
          initialFilename={item.filename}
          sourceDisplayName={sourceNameHint}
          previewItem={item}
          reservedLower={reservedLower}
          onClose={() => setRenameOpen(false)}
          onApply={(newFilename) => onRename(sectionId, item.id, newFilename)}
        />
      )}
    </div>
  )
}
