import { useEffect, useRef, useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { AssetEntry, ReplacementItem } from '../types'
import type { CategorySection } from '../utils/categories'
import { SortableAssetCard } from './SortableAssetCard'
import { ReplacementCard } from './ReplacementCard'
import { UploadReplacement } from './UploadReplacement'
import './SectionDropArea.css'

interface SectionDropAreaProps {
  section: CategorySection
  assetsById: Map<string, AssetEntry>
  getAssetImageUrl: (a: AssetEntry) => string
  onSectionsChange: (next: CategorySection[]) => void
  sections: CategorySection[]
  folderName?: string
  folderHandle?: FileSystemDirectoryHandle
  replacements?: ReplacementItem[]
  onReplacementUploaded?: (sectionId: string, item: ReplacementItem) => void
  onReplacementDelete?: (sectionId: string, itemId: string) => void
  onSectionRename?: (sectionId: string, semanticLabel: string) => void
  onSectionDelete?: (sectionId: string) => void
  newSectionIdToFocus?: string | null
  onClearNewSectionIdToFocus?: () => void
}

export function SectionDropArea({
  section,
  assetsById,
  folderName,
  folderHandle,
  replacements = [],
  onReplacementUploaded,
  onReplacementDelete,
  onSectionRename,
  onSectionDelete,
  newSectionIdToFocus,
  onClearNewSectionIdToFocus,
}: SectionDropAreaProps) {
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [titleValue, setTitleValue] = useState(section.semanticLabel || '未分类')
  const { setNodeRef, isOver } = useDroppable({ id: section.id })
  const assets = section.assetIds
    .map((id) => assetsById.get(id))
    .filter((a): a is AssetEntry => a != null)
  const sectionLabel = section.semanticLabel || '未分类'

  useEffect(() => {
    setTitleValue(section.semanticLabel || '未分类')
  }, [section.semanticLabel])

  useEffect(() => {
    if (newSectionIdToFocus === section.id && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
      onClearNewSectionIdToFocus?.()
    }
  }, [newSectionIdToFocus, section.id, onClearNewSectionIdToFocus])

  const handleUploaded = (item: ReplacementItem) => {
    onReplacementUploaded?.(section.id, item)
  }

  const handleTitleBlur = () => {
    const v = titleValue.trim() || '未分类'
    if (v !== (section.semanticLabel || '未分类')) {
      onSectionRename?.(section.id, v)
    }
  }

  return (
    <div
      ref={setNodeRef}
      className={`section-drop ${isOver ? 'over' : ''}`}
    >
      <div className="section-main">
        <div className="section-content">
          <div className="section-header-row">
            <input
              ref={titleInputRef}
              type="text"
              className="section-label-input"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleTitleBlur}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur()
                }
              }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              type="button"
              className="section-delete-btn"
              onClick={() => onSectionDelete?.(section.id)}
              title="删除分组"
              aria-label="删除分组"
            >
              删除分组
            </button>
          </div>
          <SortableContext items={section.assetIds} strategy={verticalListSortingStrategy}>
            <div className="section-cards">
              {assets.map((asset) => (
                <SortableAssetCard key={asset.id} asset={asset} />
              ))}
            </div>
          </SortableContext>
        </div>
        <div className="section-upload-wrap">
          <h4 className="section-upload-title">对应替换svg素材</h4>
          <div
            className="section-upload-card"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="upload-placeholder">可上传多张，拖拽可换组</p>
            {folderName && (
              <UploadReplacement
                folderName={folderName}
                folderHandle={folderHandle}
                sectionId={section.id}
                sectionLabel={sectionLabel}
                onUploaded={handleUploaded}
              />
            )}
            {replacements.length > 0 && (
              <div className="replacement-list">
                {replacements.map((item) => (
                  <ReplacementCard
                    key={item.id}
                    sectionId={section.id}
                    item={item}
                    onDelete={() => onReplacementDelete?.(section.id, item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
