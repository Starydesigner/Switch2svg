import { Plus, GripVertical } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { AssetEntry, ReplacementItem } from '../types'
import type { CategorySection } from '../utils/categories'
import { getAssetImageUrl } from '../utils/assetUrl'
import { parseReplacementDragId } from './ReplacementCard'
import { SectionDropArea } from './SectionDropArea'
import { AssetCardDragPreview } from './AssetCardDragPreview'
import './AssetGrid.css'

const UNCLASSIFIED_LABEL = '未分类'

function isUnclassified(section: CategorySection) {
  return (section.semanticLabel || '') === UNCLASSIFIED_LABEL
}

/** 可拖拽排序的分组包装：仅对非「未分类」分组生效 */
function SortableSection({
  section,
  sections,
  assetsById,
  folderName,
  folderHandle,
  replacements,
  onSectionsChange,
  onReplacementUploaded,
  onReplacementDelete,
  onSectionRename,
  onSectionDelete,
  newSectionIdToFocus,
  onClearNewSectionIdToFocus,
}: {
  section: CategorySection
  sections: CategorySection[]
  assetsById: Map<string, AssetEntry>
  folderName?: string
  folderHandle?: FileSystemDirectoryHandle
  replacements?: ReplacementItem[]
  onSectionsChange: (next: CategorySection[]) => void
  onReplacementUploaded?: (sectionId: string, item: ReplacementItem) => void
  onReplacementDelete?: (sectionId: string, itemId: string) => void
  onSectionRename?: (sectionId: string, semanticLabel: string) => void
  onSectionDelete?: (sectionId: string) => void
  newSectionIdToFocus?: string | null
  onClearNewSectionIdToFocus?: () => void
}) {
  const { setNodeRef, transform, transition, listeners, attributes } = useSortable({
    id: section.id,
    data: { type: 'section' as const },
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  const dragHandle = (
    <span
      className="section-drag-handle"
      {...listeners}
      {...attributes}
      title="拖动排序分组"
      aria-label="拖动排序"
    >
      <GripVertical size={16} strokeWidth={2} />
    </span>
  )
  return (
    <div ref={setNodeRef} style={style}>
      <SectionDropArea
        section={section}
        assetsById={assetsById}
        getAssetImageUrl={getAssetImageUrl}
        onSectionsChange={onSectionsChange}
        sections={sections}
        folderName={folderName}
        folderHandle={folderHandle}
        replacements={replacements}
        onReplacementUploaded={onReplacementUploaded}
        onReplacementDelete={onReplacementDelete}
        onSectionRename={onSectionRename}
        onSectionDelete={onSectionDelete}
        newSectionIdToFocus={newSectionIdToFocus}
        onClearNewSectionIdToFocus={onClearNewSectionIdToFocus}
        dragHandle={dragHandle}
      />
    </div>
  )
}

interface AssetGridProps {
  assets: AssetEntry[]
  sections: CategorySection[]
  onSectionsChange: (next: CategorySection[]) => void
  folderName?: string
  folderHandle?: FileSystemDirectoryHandle
  replacements?: Record<string, ReplacementItem[]>
  onReplacementUploaded?: (sectionId: string, item: ReplacementItem) => void
  onReplacementDelete?: (sectionId: string, itemId: string) => void
  onReplacementMove?: (fromSectionId: string, itemId: string, toSectionId: string) => void
  onAddManualGroup?: () => void
  onSectionRename?: (sectionId: string, semanticLabel: string) => void
  onSectionDelete?: (sectionId: string) => void
  newSectionIdToFocus?: string | null
  onClearNewSectionIdToFocus?: () => void
}

export function AssetGrid({
  assets,
  sections,
  onSectionsChange,
  folderName,
  folderHandle,
  replacements = {},
  onReplacementUploaded,
  onReplacementDelete,
  onReplacementMove,
  onAddManualGroup,
  onSectionRename,
  onSectionDelete,
  newSectionIdToFocus,
  onClearNewSectionIdToFocus,
}: AssetGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const assetsById = new Map(assets.map((a) => [a.id, a]))
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)
  /** 分组拖拽时，即将插入的位置（在 sortable 列表中的索引，线显示在该索引之前） */
  const [sectionInsertBeforeIndex, setSectionInsertBeforeIndex] = useState<number | null>(null)

  /** 展示顺序：未分类始终在最后 */
  const displayOrder = useMemo(
    () => [
      ...sections.filter((s) => !isUnclassified(s)),
      ...sections.filter((s) => isUnclassified(s)),
    ],
    [sections]
  )

  function handleDragStart(e: DragStartEvent) {
    const { active } = e
    const isReplacement = active.data.current?.type === 'replacement'
    if (!isReplacement && assetsById.has(active.id as string)) {
      setActiveAssetId(active.id as string)
    }
  }

  function moveAsset(assetId: string, fromSectionId: string, toSectionId: string, toIndex?: number) {
    const next = sections.map((s) => ({ ...s, assetIds: [...s.assetIds] }))
    const from = next.find((s) => s.id === fromSectionId)
    const to = next.find((s) => s.id === toSectionId)
    if (!from || !to) return
    const idx = from.assetIds.indexOf(assetId)
    if (idx === -1) return
    from.assetIds.splice(idx, 1)
    if (fromSectionId === toSectionId) {
      const insertIdx = toIndex != null ? (toIndex > idx ? toIndex - 1 : toIndex) : idx
      to.assetIds.splice(Math.min(insertIdx, to.assetIds.length), 0, assetId)
    } else {
      const insertIdx = toIndex ?? to.assetIds.length
      to.assetIds.splice(Math.min(insertIdx, to.assetIds.length), 0, assetId)
    }
    onSectionsChange(next)
  }

  const sortableSectionIds = useMemo(
    () => displayOrder.filter((s) => !isUnclassified(s)).map((s) => s.id),
    [displayOrder]
  )

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (active.data.current?.type !== 'section') return
    if (!over || typeof over.id !== 'string') {
      setSectionInsertBeforeIndex(null)
      return
    }
    const idx = sortableSectionIds.indexOf(over.id)
    setSectionInsertBeforeIndex(idx >= 0 ? idx : null)
  }

  function handleDragEnd(e: DragEndEvent) {
    setActiveAssetId(null)
    setSectionInsertBeforeIndex(null)
    const { active, over } = e
    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string

    if (active.data.current?.type === 'section') {
      const sortableIds = displayOrder.filter((s) => !isUnclassified(s)).map((s) => s.id)
      const oldIndex = sortableIds.indexOf(activeId)
      const newIndex = sortableIds.indexOf(overId)
      if (oldIndex === -1 || newIndex === -1) return
      const newOrder = arrayMove(sortableIds, oldIndex, newIndex)
      const unclassified = displayOrder.filter((s) => isUnclassified(s))
      const newSections = newOrder
        .map((id) => sections.find((s) => s.id === id))
        .filter((s): s is CategorySection => s != null)
        .concat(unclassified)
      onSectionsChange(newSections)
      return
    }

    const rep = active.data.current?.type === 'replacement' ? parseReplacementDragId(activeId) : null
    if (rep && onReplacementMove) {
      const toSectionId = overId
      if (sections.some((s) => s.id === toSectionId)) {
        onReplacementMove(rep.sectionId, rep.itemId, toSectionId)
      }
      return
    }

    const section = sections.find((s) => s.id === overId)
    if (section) {
      const fromSection = sections.find((s) => s.assetIds.includes(activeId))
      if (fromSection) moveAsset(activeId, fromSection.id, overId)
      return
    }
    const overSection = sections.find((s) => s.assetIds.includes(overId))
    const fromSection = sections.find((s) => s.assetIds.includes(activeId))
    if (overSection && fromSection) {
      const toIndex = overSection.assetIds.indexOf(overId) + 1
      moveAsset(activeId, fromSection.id, overSection.id, toIndex)
    }
  }

  const sortableSections = displayOrder.filter((s) => !isUnclassified(s))
  const unclassifiedSections = displayOrder.filter((s) => isUnclassified(s))

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setSectionInsertBeforeIndex(null)}
    >
      <div className="asset-grid">
        {onAddManualGroup && (
          <button
            type="button"
            className="add-group-card"
            onClick={onAddManualGroup}
          >
            <Plus size={16} strokeWidth={2} />
            新建分组
          </button>
        )}
        {sortableSections.map((section, index) => (
          <Fragment key={section.id}>
            {sectionInsertBeforeIndex === index && (
              <div className="section-drop-indicator" aria-hidden />
            )}
            <SortableSection
              section={section}
              sections={sections}
              assetsById={assetsById}
              folderName={folderName}
              folderHandle={folderHandle}
              replacements={replacements[section.id]}
              onSectionsChange={onSectionsChange}
              onReplacementUploaded={onReplacementUploaded}
              onReplacementDelete={onReplacementDelete}
              onSectionRename={onSectionRename}
              onSectionDelete={onSectionDelete}
              newSectionIdToFocus={newSectionIdToFocus}
              onClearNewSectionIdToFocus={onClearNewSectionIdToFocus}
            />
          </Fragment>
        ))}
        {sectionInsertBeforeIndex === sortableSections.length && sortableSections.length > 0 && (
          <div key="drop-line-end" className="section-drop-indicator" aria-hidden />
        )}
        {unclassifiedSections.map((section) => (
          <SectionDropArea
            key={section.id}
            section={section}
            assetsById={assetsById}
            getAssetImageUrl={getAssetImageUrl}
            onSectionsChange={onSectionsChange}
            sections={sections}
            folderName={folderName}
            folderHandle={folderHandle}
            replacements={replacements[section.id]}
            onReplacementUploaded={onReplacementUploaded}
            onReplacementDelete={onReplacementDelete}
            onSectionRename={onSectionRename}
            onSectionDelete={onSectionDelete}
            newSectionIdToFocus={newSectionIdToFocus}
            onClearNewSectionIdToFocus={onClearNewSectionIdToFocus}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>
        {activeAssetId ? (
          (() => {
            const asset = assetsById.get(activeAssetId)
            return asset ? <AssetCardDragPreview asset={asset} /> : null
          })()
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
