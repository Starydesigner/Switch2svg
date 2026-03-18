import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
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

/** 分组卡片包装（顺序由左侧大纲拖拽控制，此处不再支持拖拽排序） */
function SectionCard({
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
  selectedAssetIds,
  onAssetSelect,
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
  selectedAssetIds?: ReadonlySet<string>
  onAssetSelect?: (assetId: string) => void
}) {
  return (
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
      selectedAssetIds={selectedAssetIds}
      onAssetSelect={onAssetSelect}
    />
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
  /** 受控选中（与吸顶栏「移动分组」联动） */
  selectedAssetIds?: ReadonlySet<string>
  onSelectionChange?: (set: Set<string>) => void
  onMoveSelectedToSection?: (sectionId: string) => void
}

export function moveAssetsToSection(
  sections: CategorySection[],
  assetIds: string[],
  toSectionId: string,
  onSectionsChange: (next: CategorySection[]) => void
) {
  if (assetIds.length === 0) return
  const next = sections.map((s) => ({ ...s, assetIds: [...s.assetIds] }))
  const toSection = next.find((s) => s.id === toSectionId)
  if (!toSection) return
  const idSet = new Set(assetIds)
  for (const section of next) {
    section.assetIds = section.assetIds.filter((id) => !idSet.has(id))
  }
  const existingInTo = new Set(toSection.assetIds)
  for (const id of assetIds) {
    if (!existingInTo.has(id)) {
      toSection.assetIds.push(id)
      existingInTo.add(id)
    }
  }
  onSectionsChange(next)
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
  onAddManualGroup: _onAddManualGroup,
  onSectionRename,
  onSectionDelete,
  newSectionIdToFocus,
  onClearNewSectionIdToFocus,
  selectedAssetIds: controlledSelectedIds,
  onSelectionChange,
  onMoveSelectedToSection,
}: AssetGridProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const assetsById = new Map(assets.map((a) => [a.id, a]))
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null)
  const [internalSelectedIds, setInternalSelectedIds] = useState<Set<string>>(new Set())
  const selectedAssetIds = controlledSelectedIds ?? internalSelectedIds
  const setSelectedAssetIds = useCallback(
    (next: Set<string>) => {
      if (onSelectionChange) onSelectionChange(next)
      else setInternalSelectedIds(next)
    },
    [onSelectionChange]
  )
  const selectedAssetIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    selectedAssetIdsRef.current = new Set(selectedAssetIds)
  }, [selectedAssetIds])
  /** 右键菜单：有选中素材时显示 */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const handleAssetSelect = useCallback(
    (assetId: string) => {
      const next = new Set(selectedAssetIds)
      if (next.has(assetId)) next.delete(assetId)
      else next.add(assetId)
      setSelectedAssetIds(next)
    },
    [selectedAssetIds, setSelectedAssetIds]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (selectedAssetIds.size === 0) return
      e.preventDefault()
      setContextMenu({ x: e.clientX, y: e.clientY })
    },
    [selectedAssetIds.size]
  )

  const handleCopySelectedNames = useCallback(() => {
    const lines = Array.from(selectedAssetIds)
      .map((id) => {
        const a = assetsById.get(id)
        if (!a?.name) return ''
        return a.format ? `${a.name}.${a.format}` : a.name
      })
      .filter(Boolean)
    if (lines.length) navigator.clipboard.writeText(lines.join('\n'))
    setContextMenu(null)
  }, [selectedAssetIds, assetsById])

  useEffect(() => {
    if (!contextMenu) return
    const close = (e: MouseEvent) => {
      if (contextMenuRef.current?.contains(e.target as Node)) return
      setContextMenu(null)
    }
    document.addEventListener('mousedown', close, true)
    return () => document.removeEventListener('mousedown', close, true)
  }, [contextMenu])

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

  function handleDragEnd(e: DragEndEvent) {
    setActiveAssetId(null)
    const { active, over } = e
    if (!over) return
    const activeId = active.id as string
    const overId = over.id as string

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
      const currentSelection = selectedAssetIdsRef.current
      const idsToMove =
        currentSelection.has(activeId) && currentSelection.size > 1
          ? Array.from(currentSelection)
          : [activeId]
      moveAssetsToSection(sections, idsToMove, overId, onSectionsChange)
      if (idsToMove.length > 1) setSelectedAssetIds(new Set())
      return
    }
    const overSection = sections.find((s) => s.assetIds.includes(overId))
    const fromSection = sections.find((s) => s.assetIds.includes(activeId))
    if (overSection && fromSection) {
      const currentSelection = selectedAssetIdsRef.current
      const idsToMove =
        currentSelection.has(activeId) && currentSelection.size > 1
          ? Array.from(currentSelection)
          : [activeId]
      const toIndex = overSection.assetIds.indexOf(overId) + 1
      if (idsToMove.length === 1) {
        moveAsset(activeId, fromSection.id, overSection.id, toIndex)
      } else {
        moveAssetsToSection(sections, idsToMove, overSection.id, onSectionsChange)
        setSelectedAssetIds(new Set())
      }
    }
  }

  const sortableSections = displayOrder.filter((s) => !isUnclassified(s))
  const unclassifiedSections = displayOrder.filter((s) => isUnclassified(s))

  const handleMoveToSection = useCallback(
    (toSectionId: string) => {
      if (onMoveSelectedToSection) {
        onMoveSelectedToSection(toSectionId)
        setContextMenu(null)
        return
      }
      const ids = Array.from(selectedAssetIdsRef.current)
      if (ids.length === 0) return
      moveAssetsToSection(sections, ids, toSectionId, onSectionsChange)
      setSelectedAssetIds(new Set())
      setContextMenu(null)
    },
    [sections, onSectionsChange, onMoveSelectedToSection, setSelectedAssetIds]
  )

  return (
    <div className="asset-grid-root">
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="asset-grid" onContextMenu={handleContextMenu}>
        {sortableSections.map((section) => (
          <SectionCard
            key={section.id}
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
            selectedAssetIds={selectedAssetIds}
            onAssetSelect={handleAssetSelect}
          />
        ))}
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
            selectedAssetIds={selectedAssetIds}
            onAssetSelect={handleAssetSelect}
          />
        ))}
      </div>
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="asset-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          role="menu"
        >
          <button type="button" className="asset-context-menu-item" role="menuitem" onClick={handleCopySelectedNames}>
            复制选中素材名称
          </button>
          <div className="asset-context-menu-divider" aria-hidden />
          <div className="asset-context-menu-label">移动分组</div>
          {displayOrder.map((section) => (
            <button
              key={section.id}
              type="button"
              className="asset-context-menu-item"
              role="menuitem"
              onClick={() => handleMoveToSection(section.id)}
            >
              {section.semanticLabel || '未命名'}
            </button>
          ))}
        </div>
      )}
      <DragOverlay dropAnimation={null}>
        {activeAssetId ? (
          (() => {
            const asset = assetsById.get(activeAssetId)
            return asset ? <AssetCardDragPreview asset={asset} /> : null
          })()
        ) : null}
      </DragOverlay>
      </DndContext>
    </div>
  )
}
