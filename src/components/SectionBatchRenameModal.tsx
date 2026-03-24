import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { ReplacementItem } from '../types'
import {
  allocateUniqueBatchRename,
  batchRenameMiddleFromOriginalLabel,
  buildBatchRenameFilename,
  inferBatchRenamePrefixSuffixFromLabel,
  parseBatchRenameParts,
  parseFilename,
  sanitizeReplacementFilename,
  validateReplacementFilename,
  type BatchRenamePrefix,
  type BatchRenameSuffix,
} from '../utils/replacementNaming'
import { NamingRuleBullets } from './NamingRuleBullets'
import { ReplacementThumbnail } from './ReplacementThumbnail'
import './SectionBatchRenameModal.css'

type RowParts = { prefix: BatchRenamePrefix; middle: string; suffix: BatchRenameSuffix }

export function SectionBatchRenameModal({
  open,
  sectionLabel,
  replacements,
  allFilenamesLower,
  onClose,
  onApply,
}: {
  open: boolean
  sectionLabel: string
  replacements: ReplacementItem[]
  /** 当前文件夹下所有替换图文件名（小写），用于撞名检测 */
  allFilenamesLower: Set<string>
  onClose: () => void
  onApply: (drafts: Record<string, string>) => Promise<void>
}) {
  const [partsById, setPartsById] = useState<Record<string, RowParts>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const next: Record<string, RowParts> = {}
    for (const r of replacements) {
      const p = parseBatchRenameParts(r.filename)
      next[r.id] = { prefix: p.prefix, middle: p.middle, suffix: p.suffix }
    }
    setPartsById(next)
  }, [open, replacements])

  const drafts = useMemo(() => {
    const d: Record<string, string> = {}
    for (const r of replacements) {
      const parts = partsById[r.id]
      if (!parts) continue
      const ext = parseFilename(r.filename)?.ext ?? '.svg'
      d[r.id] = buildBatchRenameFilename(parts.prefix, parts.middle, parts.suffix, ext)
    }
    return d
  }, [partsById, replacements])

  const rowIssues = useMemo(() => {
    const issues: Record<string, string[]> = {}
    const lowerToIds = new Map<string, string[]>()
    for (const r of replacements) {
      const fn = sanitizeReplacementFilename(drafts[r.id] ?? r.filename)
      const lower = fn.toLowerCase()
      if (!lowerToIds.has(lower)) lowerToIds.set(lower, [])
      lowerToIds.get(lower)!.push(r.id)
    }
    for (const ids of lowerToIds.values()) {
      if (ids.length > 1) {
        for (const id of ids) {
          issues[id] = [...(issues[id] ?? []), '本批量中有重复文件名']
        }
      }
    }

    const taken = new Set(allFilenamesLower)
    for (const r of replacements) {
      taken.delete(r.filename.toLowerCase())
    }
    for (const r of replacements) {
      const fn = sanitizeReplacementFilename(drafts[r.id] ?? r.filename)
      const v = validateReplacementFilename(fn, { reservedLower: taken })
      if (v.level === 'error') {
        issues[r.id] = [...(issues[r.id] ?? []), ...v.messages]
      }
      taken.add(fn.toLowerCase())
    }

    for (const r of replacements) {
      const parts = partsById[r.id]
      if (!parts) continue
      if (!parts.middle.trim()) {
        issues[r.id] = [...(issues[r.id] ?? []), '名称段不能为空']
      }
    }

    return issues
  }, [drafts, replacements, allFilenamesLower, partsById])

  const hasErrors = Object.values(rowIssues).some((a) => a.length > 0)

  const handleSmartFillAll = () => {
    setPartsById(() => {
      const taken = new Set(allFilenamesLower)
      for (const r of replacements) {
        taken.delete(r.filename.toLowerCase())
      }
      const next: Record<string, RowParts> = {}
      for (let i = 0; i < replacements.length; i++) {
        const r = replacements[i]!
        const label = r.filename
        const { prefix, suffix } = inferBatchRenamePrefixSuffixFromLabel(label)
        const middleRaw = batchRenameMiddleFromOriginalLabel(label)
        const ext = parseFilename(r.filename)?.ext ?? '.svg'
        const { middle } = allocateUniqueBatchRename(prefix, middleRaw, suffix, ext, taken)
        const full = buildBatchRenameFilename(prefix, middle, suffix, ext)
        taken.add(full.toLowerCase())
        next[r.id] = { prefix, middle, suffix }
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (hasErrors) {
      window.alert('请先修正标红的文件名冲突或格式错误')
      return
    }
    setBusy(true)
    try {
      await onApply(drafts)
      onClose()
    } catch (err: any) {
      window.alert(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="batch-rename-overlay" role="dialog" aria-modal="true" aria-label="批量重命名" onClick={onClose}>
      <div className="batch-rename-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="batch-rename-dialog-sticky">
          <div className="batch-rename-head">
            <span>批量重命名 · {sectionLabel}</span>
            <button type="button" className="batch-rename-close" onClick={onClose} aria-label="关闭">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
        </header>
        <div className="batch-rename-dialog-scroll">
          <div className="batch-rename-intro">
            <NamingRuleBullets />
          </div>
          <button type="button" className="batch-rename-smart-plain" onClick={handleSmartFillAll}>
            全部智能填充（按各文件当前名称推断）
          </button>
          <form onSubmit={handleSubmit}>
          <div className="batch-rename-rows">
            {replacements.map((r) => {
              const errs = rowIssues[r.id] ?? []
              const parts = partsById[r.id]
              const ext = parseFilename(r.filename)?.ext ?? '.svg'
              return (
                <div key={r.id} className={`batch-rename-row ${errs.length ? 'batch-rename-row--err' : ''}`}>
                  <div className="batch-rename-original-line">
                    <span className="batch-rename-original-label">原名称</span>
                    <span className="batch-rename-original-value" title={r.filename}>
                      {r.filename}
                    </span>
                  </div>
                  <div className="batch-rename-row-editor-wrap">
                    <ReplacementThumbnail item={r} />
                    <div className="batch-rename-row-editor">
                    <select
                      className="batch-rename-segment-select"
                      value={parts?.prefix ?? 'ic'}
                      onChange={(e) =>
                        setPartsById((p) => ({
                          ...p,
                          [r.id]: { ...(p[r.id] ?? { prefix: 'ic', middle: 'unnamed', suffix: 'line' }), prefix: e.target.value as BatchRenamePrefix },
                        }))
                      }
                      aria-label="前缀"
                    >
                      <option value="ic">ic</option>
                      <option value="img">img</option>
                      <option value="bg">bg</option>
                    </select>
                    <span className="batch-rename-sep" aria-hidden>
                      _
                    </span>
                    <input
                      type="text"
                      className="batch-rename-row-input batch-rename-row-input--middle"
                      value={parts?.middle ?? ''}
                      onChange={(e) =>
                        setPartsById((p) => ({
                          ...p,
                          [r.id]: { ...(p[r.id] ?? { prefix: 'ic', middle: '', suffix: 'line' }), middle: e.target.value },
                        }))
                      }
                      placeholder="名称"
                      spellCheck={false}
                      autoComplete="off"
                      aria-label="名称"
                    />
                    <span className="batch-rename-sep" aria-hidden>
                      _
                    </span>
                    <select
                      className="batch-rename-segment-select"
                      value={parts?.suffix ?? 'line'}
                      onChange={(e) =>
                        setPartsById((p) => ({
                          ...p,
                          [r.id]: { ...(p[r.id] ?? { prefix: 'ic', middle: 'unnamed', suffix: 'line' }), suffix: e.target.value as BatchRenameSuffix },
                        }))
                      }
                      aria-label="后缀"
                    >
                      <option value="line">line</option>
                      <option value="filled">filled</option>
                    </select>
                    <span className="batch-rename-ext" title="沿用当前文件扩展名">
                      {ext}
                    </span>
                    </div>
                  </div>
                  {errs.length > 0 && <span className="batch-rename-row-err">{errs.join('；')}</span>}
                </div>
              )
            })}
          </div>
          <div className="batch-rename-actions">
            <button type="button" className="batch-rename-cancel" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="submit" className="batch-rename-submit save-btn" disabled={busy || replacements.length === 0}>
              {busy ? '处理中…' : '应用全部'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  )
}
