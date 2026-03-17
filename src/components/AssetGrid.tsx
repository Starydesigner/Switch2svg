import {
  DndContext,
  DragEndEvent,
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
import './AssetGrid.css'

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

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="asset-grid">
        {onAddManualGroup && (
          <button
            type="button"
            className="add-group-card"
            onClick={onAddManualGroup}
          >
            + 新建分组
          </button>
        )}
        {sections.map((section) => (
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
    </DndContext>
  )
}
