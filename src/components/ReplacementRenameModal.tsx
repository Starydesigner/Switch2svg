import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { ReplacementItem } from '../types'
import {
  allocateUniqueBatchRename,
  allocateUniqueFilename,
  batchRenameMiddleFromOriginalLabel,
  buildBatchRenameFilename,
  inferBatchRenamePrefixSuffixFromLabel,
  parseBatchRenameParts,
  parseFilename,
  sanitizeReplacementFilename,
  validateReplacementFilename,
  type BatchRenamePrefix,
  type BatchRenameSuffix,
  type ValidateResult,
} from '../utils/replacementNaming'
import { NamingRuleBullets } from './NamingRuleBullets'
import { ReplacementThumbnail } from './ReplacementThumbnail'
import './SectionBatchRenameModal.css'
import './ReplacementRenameModal.css'

export function ReplacementRenameModal({
  open,
  initialFilename,
  sourceDisplayName,
  previewItem,
  reservedLower,
  onClose,
  onApply,
}: {
  open: boolean
  initialFilename: string
  /** 同序左侧素材展示名（仅展示参考，不参与智能填充） */
  sourceDisplayName?: string
  /** 用于缩略图预览，与批量重命名一致 */
  previewItem: ReplacementItem
  reservedLower: Set<string>
  onClose: () => void
  onApply: (newFilename: string) => Promise<void>
}) {
  const parsed = useMemo(() => parseFilename(initialFilename), [initialFilename])
  const [prefix, setPrefix] = useState<BatchRenamePrefix>('ic')
  const [middle, setMiddle] = useState('')
  const [suffix, setSuffix] = useState<BatchRenameSuffix>('line')
  const [busy, setBusy] = useState(false)

  const ext = parsed?.ext ?? '.svg'

  useEffect(() => {
    if (!open || !parsed) return
    const parts = parseBatchRenameParts(initialFilename)
    setPrefix(parts.prefix)
    setMiddle(parts.middle)
    setSuffix(parts.suffix)
  }, [open, initialFilename, parsed])

  const previewFull = useMemo(
    () => buildBatchRenameFilename(prefix, middle, suffix, ext),
    [prefix, middle, suffix, ext]
  )

  const validation: ValidateResult = useMemo(() => {
    const safe = sanitizeReplacementFilename(previewFull)
    return validateReplacementFilename(safe, { reservedLower })
  }, [previewFull, reservedLower])

  const emptyMiddle = !middle.trim()
  const errMsgs = emptyMiddle
    ? ['名称段不能为空']
    : validation.level === 'error'
      ? validation.messages
      : []

  if (!open || !parsed) return null

  const handleSmartFill = () => {
    const label = initialFilename
    const { prefix: p, suffix: s } = inferBatchRenamePrefixSuffixFromLabel(label)
    const middleRaw = batchRenameMiddleFromOriginalLabel(label)
    const taken = new Set(reservedLower)
    const { middle: mid } = allocateUniqueBatchRename(p, middleRaw, s, ext, taken)
    setPrefix(p)
    setSuffix(s)
    setMiddle(mid)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!middle.trim()) {
      window.alert('名称段不能为空')
      return
    }
    let finalName = sanitizeReplacementFilename(previewFull)
    const taken = new Set(reservedLower)
    finalName = allocateUniqueFilename(finalName, taken)
    const v = validateReplacementFilename(finalName, { reservedLower: taken })
    if (v.level === 'error') {
      window.alert(v.messages.join('；'))
      return
    }
    setBusy(true)
    try {
      await onApply(finalName)
      onClose()
    } catch (err: any) {
      window.alert(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="replacement-rename-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="重命名替换图"
      onClick={onClose}
    >
      <div className="replacement-rename-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="replacement-rename-top">
          <div className="replacement-rename-head">
            <span>重命名替换图</span>
            <button type="button" className="replacement-rename-close" onClick={onClose} aria-label="关闭">
              <X size={18} strokeWidth={2} />
            </button>
          </div>
          <NamingRuleBullets />
        </div>
        <button type="button" className="batch-rename-smart-plain replacement-rename-smart-plain" onClick={handleSmartFill}>
          智能填充
        </button>
        <form onSubmit={handleSubmit}>
          <div className={`batch-rename-row ${errMsgs.length ? 'batch-rename-row--err' : ''}`}>
            <div className="batch-rename-original-line">
              <span className="batch-rename-original-label">原名称</span>
              <span className="batch-rename-original-value" title={initialFilename}>
                {initialFilename}
              </span>
            </div>
            <div className="batch-rename-row-editor-wrap">
              <ReplacementThumbnail item={previewItem} />
              <div className="batch-rename-row-editor">
                <select
                  className="batch-rename-segment-select"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value as BatchRenamePrefix)}
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
                  value={middle}
                  onChange={(e) => setMiddle(e.target.value)}
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
                  value={suffix}
                  onChange={(e) => setSuffix(e.target.value as BatchRenameSuffix)}
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
            {sourceDisplayName?.trim() && (
              <p className="replacement-rename-source-hint">
                左侧同序素材：<code>{sourceDisplayName.trim()}</code>
              </p>
            )}
            <div
              className={`replacement-rename-hint replacement-rename-hint--${
                errMsgs.length ? 'error' : validation.level
              }`}
            >
              {errMsgs.length > 0 ? (
                errMsgs.map((m) => <span key={m}>{m}</span>)
              ) : (
                <>
                  {validation.level === 'ok' && validation.messages.length === 0 && <span>命名检查通过</span>}
                  {validation.messages.map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </>
              )}
            </div>
          </div>
          <div className="replacement-rename-actions">
            <button type="button" className="replacement-rename-cancel" onClick={onClose} disabled={busy}>
              取消
            </button>
            <button type="submit" className="replacement-rename-submit save-btn" disabled={busy}>
              {busy ? '处理中…' : '确定'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
