import { useEffect, useRef, useState } from 'react'
import { Trash2, ArrowBigRightDash, ChevronDown, FilePenLine } from 'lucide-react'
import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { AssetEntry, ReplacementItem } from '../types'
import type { CategorySection, SectionReplaceMode } from '../utils/categories'
import { SortableAssetCard } from './SortableAssetCard'
import { ReplacementCard } from './ReplacementCard'
import type { LiveFolderAccess } from '../utils/fsa'
import { UploadReplacement } from './UploadReplacement'
import { SectionBatchRenameModal } from './SectionBatchRenameModal'
import './SectionDropArea.css'

interface SectionDropAreaProps {
  section: CategorySection
  assetsById: Map<string, AssetEntry>
  getAssetImageUrl: (a: AssetEntry) => string
  onSectionsChange: (next: CategorySection[]) => void
  sections: CategorySection[]
  folderName?: string
  folderAccess?: LiveFolderAccess
  replacements?: ReplacementItem[]
  onReplacementUploaded?: (sectionId: string, item: ReplacementItem) => void
  onReplacementDelete?: (sectionId: string, itemId: string) => void
  /** 当前文件夹下所有替换图文件名（小写） */
  replacementFilenamesLower?: Set<string>
  canRenameReplacements?: boolean
  onReplacementRename?: (sectionId: string, itemId: string, newFilename: string) => Promise<void>
  onBatchReplacementRename?: (sectionId: string, drafts: Record<string, string>) => Promise<void>
  onSectionRename?: (sectionId: string, semanticLabel: string) => void
  onSectionDelete?: (sectionId: string) => void
  newSectionIdToFocus?: string | null
  onClearNewSectionIdToFocus?: () => void
  /** 拖拽排序时放在标题前的把手，仅非「未分类」分组使用 */
  dragHandle?: React.ReactNode
  /** 选中的素材 id 集合（用于多选与批量移动） */
  selectedAssetIds?: ReadonlySet<string>
  /** 点击素材卡片时切换/设置选中 */
  onAssetSelect?: (assetId: string) => void
  /** 分组替换策略变更：可替换 / 可删除 / 保持原样 */
  onSectionReplaceModeChange?: (sectionId: string, mode: SectionReplaceMode) => void
  /** 双击/空格全屏预览素材 */
  onAssetPreview?: (asset: AssetEntry) => void
  /** 若提供，仅展示这些 id 的素材卡片（分组内仍保留完整 assetIds，不改动配置） */
  visibleAssetIds?: ReadonlySet<string> | null
}

export function SectionDropArea({
  section,
  assetsById,
  folderName,
  folderAccess,
  replacements = [],
  onReplacementUploaded,
  onReplacementDelete,
  replacementFilenamesLower,
  canRenameReplacements,
  onReplacementRename,
  onBatchReplacementRename,
  onSectionRename,
  onSectionDelete,
  newSectionIdToFocus,
  onClearNewSectionIdToFocus,
  dragHandle,
  selectedAssetIds,
  onAssetSelect,
  onSectionReplaceModeChange,
  onAssetPreview,
  visibleAssetIds,
}: SectionDropAreaProps) {
  const [batchRenameOpen, setBatchRenameOpen] = useState(false)
  const isUnclassified = (section.semanticLabel || '') === '未分类'
  const replaceMode = section.replaceMode ?? 'replace'
  const showUpload = replaceMode === 'replace' && !isUnclassified
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [titleValue, setTitleValue] = useState(section.semanticLabel || '未分类')
  const { setNodeRef, isOver } = useDroppable({ id: section.id })
  const listedAssetIds = visibleAssetIds
    ? section.assetIds.filter((id) => visibleAssetIds.has(id))
    : section.assetIds
  const assets = listedAssetIds
    .map((id) => assetsById.get(id))
    .filter((a): a is AssetEntry => a != null)

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
      id={`section-${section.id}`}
      ref={setNodeRef}
      className={`section-drop ${isOver ? 'over' : ''}`}
    >
      <div className="section-main">
        <div className="section-content">
          <div className="section-header-row">
            {dragHandle}
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
            {!isUnclassified && (
              <button
                type="button"
                className="section-delete-btn"
                onClick={() => onSectionDelete?.(section.id)}
                title="删除分组"
                aria-label="删除分组"
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            )}
          </div>
          <SortableContext items={listedAssetIds} strategy={verticalListSortingStrategy}>
            <div className="section-cards">
              {assets.map((asset) => (
                <SortableAssetCard
                  key={asset.id}
                  asset={asset}
                  isSelected={selectedAssetIds?.has(asset.id)}
                  onSelect={onAssetSelect}
                  onPreview={onAssetPreview}
                />
              ))}
            </div>
          </SortableContext>
        </div>
        <div className="section-replace-hint" aria-hidden>
          <ArrowBigRightDash size={20} strokeWidth={2} />
          <span>替换为</span>
        </div>
        <div className={`section-upload-wrap section-upload-wrap--${replaceMode}`}>
          {!isUnclassified && onSectionReplaceModeChange && (
            <div className="section-replace-mode-row">
              <div className="section-replace-mode-wrap">
                <select
                  className="section-replace-mode-select"
                  value={replaceMode}
                  onChange={(e) => onSectionReplaceModeChange(section.id, e.target.value as SectionReplaceMode)}
                  aria-label="替换策略"
                >
                  <option value="replace">可替换</option>
                  <option value="delete">可删除</option>
                  <option value="keep">保持原样</option>
                </select>
                <ChevronDown size={14} strokeWidth={2} className="section-replace-mode-chevron" aria-hidden />
              </div>
              {replaceMode === 'replace' &&
                replacements.length > 0 &&
                canRenameReplacements &&
                onBatchReplacementRename &&
                replacementFilenamesLower && (
                  <button
                    type="button"
                    className="section-batch-rename-btn"
                    onClick={() => setBatchRenameOpen(true)}
                    title="批量按规范重命名本组替换图"
                  >
                    <FilePenLine size={14} strokeWidth={2} aria-hidden />
                    批量重命名
                  </button>
                )}
            </div>
          )}
          <div
            className="section-upload-card"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {replaceMode === 'delete' && (
              <p className="section-upload-mode-hint" aria-live="polite">
                请确认删除素材不影响当前版本
              </p>
            )}
            {replaceMode === 'keep' && (
              <p className="section-upload-mode-hint" aria-live="polite">
                该组内容无需替换，暂不调整
              </p>
            )}
            {showUpload && folderName && (
              <UploadReplacement
                folderName={folderName}
                folderAccess={folderAccess}
                onUploaded={handleUploaded}
              />
            )}
            {replacements.length > 0 &&
              replacements.map((item, repIndex) => (
                <ReplacementCard
                  key={item.id}
                  sectionId={section.id}
                  item={item}
                  sourceNameHint={assets[repIndex]?.name}
                  onDelete={() => onReplacementDelete?.(section.id, item.id)}
                  replacementFilenamesLower={replacementFilenamesLower ?? new Set()}
                  canRename={canRenameReplacements}
                  onRename={onReplacementRename}
                />
              ))}
            {replacements.length === 0 && showUpload && (
              <span className="upload-placeholder">可上传多张，拖拽可换组</span>
            )}
          </div>
        </div>
      </div>
      {batchRenameOpen &&
        onBatchReplacementRename &&
        replacementFilenamesLower && (
          <SectionBatchRenameModal
            open={batchRenameOpen}
            sectionLabel={section.semanticLabel || '分组'}
            replacements={replacements}
            allFilenamesLower={replacementFilenamesLower}
            onClose={() => setBatchRenameOpen(false)}
            onApply={(drafts) => onBatchReplacementRename(section.id, drafts)}
          />
        )}
    </div>
  )
}
