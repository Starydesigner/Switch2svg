import { Fragment, useState } from 'react'
import { GripVertical } from 'lucide-react'
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { arrayMove, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CategorySection } from '../utils/categories'
import './SectionOutline.css'

const UNCLASSIFIED_LABEL = '未分类'

function isUnclassified(section: CategorySection) {
  return (section.semanticLabel || '') === UNCLASSIFIED_LABEL
}

function SortableOutlineItem({
  section,
  onSectionClick,
}: {
  section: CategorySection
  onSectionClick?: (sectionId: string) => void
}) {
  const { setNodeRef, transform, transition, attributes, listeners, isDragging } = useSortable({
    id: section.id,
    data: { type: 'outline-section' as const },
  })
  const style = { transform: CSS.Transform.toString(transform), transition }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`outline-item ${isDragging ? 'outline-item-dragging' : ''}`}
    >
      <span className="outline-item-handle" {...attributes} {...listeners} title="拖动排序" aria-label="拖动">
        <GripVertical size={14} strokeWidth={2} />
      </span>
      <span
        className="outline-item-label outline-item-clickable"
        role="button"
        tabIndex={0}
        onClick={() => onSectionClick?.(section.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSectionClick?.(section.id)
          }
        }}
      >
        {section.semanticLabel || '未命名'}
      </span>
    </div>
  )
}

interface SectionOutlineProps {
  sections: CategorySection[]
  onReorder: (newOrder: CategorySection[]) => void
  onSectionClick?: (sectionId: string) => void
}

export function SectionOutline({ sections, onReorder, onSectionClick }: SectionOutlineProps) {
  const [insertBeforeIndex, setInsertBeforeIndex] = useState<number | null>(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const sortableSections = sections.filter((s) => !isUnclassified(s))
  const unclassifiedSections = sections.filter((s) => isUnclassified(s))
  const sortableIds = sortableSections.map((s) => s.id)

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (active.data.current?.type !== 'outline-section') {
      setInsertBeforeIndex(null)
      return
    }
    if (!over || typeof over.id !== 'string') {
      setInsertBeforeIndex(null)
      return
    }
    const idx = sortableIds.indexOf(over.id)
    setInsertBeforeIndex(idx >= 0 ? idx : null)
  }

  function handleDragEnd(e: DragEndEvent) {
    setInsertBeforeIndex(null)
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = sortableIds.indexOf(active.id as string)
    const newIndex = sortableIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    const newSortable = arrayMove(sortableSections, oldIndex, newIndex)
    onReorder([...newSortable, ...unclassifiedSections])
  }

  return (
    <aside className="outline-sidebar" aria-label="分组目录">
      <div className="outline-title">分组</div>
      <DndContext sensors={sensors} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="outline-list">
          {sortableSections.map((section, index) => (
            <Fragment key={section.id}>
              {insertBeforeIndex === index && <div className="outline-drop-indicator" aria-hidden />}
              <SortableOutlineItem section={section} onSectionClick={onSectionClick} />
            </Fragment>
          ))}
          {insertBeforeIndex === sortableSections.length && sortableSections.length > 0 && (
            <div className="outline-drop-indicator" aria-hidden />
          )}
          {unclassifiedSections.map((section) => (
            <div
              key={section.id}
              className="outline-item outline-item-fixed outline-item-clickable"
              role="button"
              tabIndex={0}
              onClick={() => onSectionClick?.(section.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSectionClick?.(section.id)
                }
              }}
            >
              <span className="outline-item-label">{section.semanticLabel || '未命名'}</span>
            </div>
          ))}
        </div>
      </DndContext>
    </aside>
  )
}
