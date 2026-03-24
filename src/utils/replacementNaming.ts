/** 替换图文件名规范校验与规范化建议（机检可覆盖部分；语义化等依赖人工） */

import { pinyin } from 'pinyin-pro'

export type ValidateLevel = 'ok' | 'warn' | 'error'

export interface ValidateResult {
  level: ValidateLevel
  messages: string[]
}

/** 与 saveReplacementFile 一致：去掉路径非法字符 */
export function sanitizeReplacementFilename(name: string): string {
  return name.replace(/[/\\?*:]/g, '_').trim()
}

export function parseFilename(filename: string): { stem: string; ext: string } | null {
  const t = filename.trim()
  const dot = t.lastIndexOf('.')
  if (dot <= 0 || dot === t.length - 1) return null
  const ext = t.slice(dot)
  const stem = t.slice(0, dot)
  if (!stem) return null
  return { stem, ext: ext.toLowerCase() }
}

/** 仅允许 ASCII 字母数字与 _ . -，且需有扩展名 */
const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*\.[a-zA-Z0-9]+$/

/**
 * @param reservedLower 已占用文件名（建议小写集合，用于大小写不敏感碰撞）
 */
export function validateReplacementFilename(
  filename: string,
  options?: { reservedLower?: Set<string>; currentLower?: string }
): ValidateResult {
  const messages: string[] = []
  const t = filename.trim()
  if (!t) {
    return { level: 'error', messages: ['文件名不能为空'] }
  }
  const parsed = parseFilename(t)
  if (!parsed) {
    return { level: 'error', messages: ['需要包含扩展名，例如 .svg'] }
  }
  if (!SAFE_NAME_RE.test(t)) {
    return {
      level: 'error',
      messages: ['仅允许字母、数字、下划线、连字符与单一点分隔扩展名；且不得以点开头'],
    }
  }
  const lower = t.toLowerCase()
  const reserved = options?.reservedLower
  if (reserved?.has(lower)) {
    const cur = options?.currentLower
    if (!cur || lower !== cur) {
      return { level: 'error', messages: ['与已有替换图文件名冲突'] }
    }
  }

  let level: ValidateLevel = 'ok'
  if (/[A-Z]/.test(parsed.stem) || /[A-Z]/.test(parsed.ext.slice(1))) {
    messages.push('建议使用全小写')
    level = 'warn'
  }
  if (parsed.stem.includes('-')) {
    messages.push('推荐用下划线 _ 分隔（当前含连字符）')
    level = 'warn'
  }
  if (/^\d/.test(parsed.stem)) {
    messages.push('主名以数字开头，规范上建议避免')
    level = 'warn'
  }
  if (!/^(ic|img|bg)_/.test(parsed.stem)) {
    messages.push('推荐统一前缀：ic_ / img_ / bg_ 等')
    level = 'warn'
  }
  return { level, messages }
}

export function suggestNormalizedStem(raw: string, opts?: { prefix?: string }): string {
  let s = raw.trim().toLowerCase()
  s = s.replace(/[/\\?*:]/g, '_')
  s = s.replace(/[^a-z0-9_.-]+/g, '_')
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '')
  const prefix = opts?.prefix?.replace(/_+$/, '') ?? ''
  if (prefix && !s.startsWith(prefix)) {
    const rest = s.replace(/^[^a-z0-9]+/, '')
    s = rest ? `${prefix}_${rest}` : prefix
  }
  return s
}

/** 在已有文件名（小写）集合中生成不冲突的完整文件名 */
export function allocateUniqueFilename(desiredFull: string, takenLower: Set<string>): string {
  const parsed = parseFilename(desiredFull)
  if (!parsed) return desiredFull
  const lower = desiredFull.toLowerCase()
  if (!takenLower.has(lower)) return desiredFull
  const ext = parsed.ext
  let base = parsed.stem
  const m = base.match(/^(.+)_(\d+)$/)
  if (m) base = m[1]!
  let n = 2
  let candidate = `${base}_${n}${ext}`
  while (takenLower.has(candidate.toLowerCase())) {
    n += 1
    candidate = `${base}_${n}${ext}`
  }
  return candidate
}

/** 从完整文件名得到建议 stem（保留扩展名由调用方拼接） */
export function suggestFullFilenameFromStemInput(
  stemInput: string,
  ext: string,
  opts?: { prefix?: string }
): string {
  const extNorm = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  const stem = suggestNormalizedStem(stemInput, opts)
  if (!stem) return `unnamed${extNorm}`
  return `${stem}${extNorm}`
}

/** 去掉末尾常见倍图/密度后缀，便于从「首页@2x」得到语义主干 */
export function stripDisplayScaleSuffixes(stem: string): string {
  let s = stem.trim()
  s = s.replace(/@[0-9]+x$/i, '')
  s = s.replace(/@[0-9]+×[0-9]+$/i, '')
  s = s.replace(/[-_](?:hdpi|xhdpi|xxhdpi|xxxhdpi|mdpi|ldpi)(?:@[0-9]+x)?$/i, '')
  return s.replace(/[-_.\s]+$/g, '').trim()
}

/** 从素材展示名或路径取命名主干（去路径、扩展名、倍图后缀） */
export function stemFromOriginalDisplayName(displayName: string): string {
  const t = displayName.trim().replace(/\\/g, '/')
  const base = t.includes('/') ? t.slice(t.lastIndexOf('/') + 1) : t
  const dot = base.lastIndexOf('.')
  const stem = dot > 0 ? base.slice(0, dot) : base
  return stripDisplayScaleSuffixes(stem)
}

/**
 * 含中文的文件名/标签 → 蛇形小写主名（`pinyin-pro` 本地拼音，非 AI）。
 * 智能填充当前固定走本方案；非中文仅做规范化。
 */
export function smartStemFromOriginalLabel(displayName: string, opts?: { prefix?: string }): string {
  const stem = stemFromOriginalDisplayName(displayName)
  if (!stem) {
    return suggestNormalizedStem('unnamed', opts) || 'unnamed'
  }
  const parts = pinyin(stem, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
  })
  const joined = parts
    .join('_')
    .toLowerCase()
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  const normalized = suggestNormalizedStem(joined || 'unnamed', opts)
  return normalized || 'unnamed'
}

/** 由原始标签得到完整替换文件名（保留指定扩展名） */
export function smartFullFilenameFromOriginalLabel(
  displayName: string,
  ext: string,
  opts?: { prefix?: string }
): string {
  const extNorm = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  const stem = smartStemFromOriginalLabel(displayName, opts)
  return `${stem}${extNorm}`
}

/** 批量重命名：前缀 + 名称 + 后缀（filled | line） */
export type BatchRenamePrefix = 'ic' | 'img' | 'bg'
export type BatchRenameSuffix = 'filled' | 'line'

export interface BatchRenameParts {
  prefix: BatchRenamePrefix
  middle: string
  suffix: BatchRenameSuffix
  ext: string
}

/** 从完整文件名解析三段；无法识别时退回整 stem 作为 middle */
export function parseBatchRenameParts(filename: string): BatchRenameParts {
  const p = parseFilename(filename.trim())
  if (!p) {
    return { prefix: 'ic', middle: 'unnamed', suffix: 'line', ext: '.svg' }
  }
  const ext = p.ext.toLowerCase()
  const stem = p.stem
  const m = stem.match(/^(ic|img|bg)_(.+)_(filled|line)$/i)
  if (m) {
    return {
      prefix: m[1]!.toLowerCase() as BatchRenamePrefix,
      middle: m[2]!,
      suffix: m[3]!.toLowerCase() as BatchRenameSuffix,
      ext,
    }
  }
  const m2 = stem.match(/^(ic|img|bg)_(.+)$/i)
  if (m2) {
    return {
      prefix: m2[1]!.toLowerCase() as BatchRenamePrefix,
      middle: m2[2]!,
      suffix: 'line',
      ext,
    }
  }
  const mid = suggestNormalizedStem(stem) || 'unnamed'
  return { prefix: 'ic', middle: mid, suffix: 'line', ext }
}

/** 规范 middle 并拼接：{prefix}_{middle}_{suffix}{ext} */
export function buildBatchRenameFilename(
  prefix: BatchRenamePrefix,
  middle: string,
  suffix: BatchRenameSuffix,
  ext: string
): string {
  const extNorm = ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  let mid = suggestNormalizedStem(middle) || 'unnamed'
  mid = mid.replace(/^(ic|img|bg)_/i, '')
  mid = mid.replace(/_(filled|line)$/i, '')
  return `${prefix}_${mid}_${suffix}${extNorm}`
}

/**
 * 根据原始素材/文件名推断前缀与后缀（关键词 + 中英文，无 AI）
 */
export function inferBatchRenamePrefixSuffixFromLabel(label: string): {
  prefix: BatchRenamePrefix
  suffix: BatchRenameSuffix
} {
  const s = label.toLowerCase()
  let prefix: BatchRenamePrefix = 'ic'
  if (/\b(bg|background)\b|背景|底图|开屏|启动|闪屏|banner|splash|壁纸/.test(s)) {
    prefix = 'bg'
  } else if (/\b(img|image|picture|photo)\b|插图|配图|相册|封面图|头图|大图/.test(s)) {
    prefix = 'img'
  }
  let suffix: BatchRenameSuffix = 'line'
  if (/\b(fill|filled|solid|glyph)\b|实心|填充|面性/.test(s)) {
    suffix = 'filled'
  }
  return { prefix, suffix }
}

/**
 * 智能填充「名称」段：应传入**替换图当前文件名**（可含扩展名）。去倍图后缀、尾部 filled/line 后再拼音/规范化。
 */
export function batchRenameMiddleFromOriginalLabel(label: string): string {
  let stem = stemFromOriginalDisplayName(label)
  stem = stem.replace(/_(filled|line|outline)$/i, '')
  return smartStemFromOriginalLabel(stem)
}

/** 在 taken 集合内为三段式文件名分配不冲突的 middle（必要时加 _2、_3） */
export function allocateUniqueBatchRename(
  prefix: BatchRenamePrefix,
  middle: string,
  suffix: BatchRenameSuffix,
  ext: string,
  takenLower: Set<string>
): { middle: string; full: string } {
  const baseMid =
    (suggestNormalizedStem(middle) || 'unnamed')
      .replace(/^(ic|img|bg)_/i, '')
      .replace(/_(filled|line)$/i, '') || 'unnamed'
  let mid = baseMid
  let full = buildBatchRenameFilename(prefix, mid, suffix, ext)
  let n = 2
  while (takenLower.has(full.toLowerCase())) {
    mid = `${baseMid}_${n}`
    n += 1
    full = buildBatchRenameFilename(prefix, mid, suffix, ext)
  }
  return { middle: mid, full }
}
