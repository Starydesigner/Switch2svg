import type { AssetEntry } from '../types'
import { getSemanticLabel } from './semanticRules'

export interface CategorySection {
  id: string
  format: string
  semanticLabel: string
  assetIds: string[]
}

/** 持久化 v2：按 folderId 存每文件夹的 mode + sections */
export interface FolderCategoryConfig {
  mode: 'auto' | 'manual'
  sections: CategorySection[]
}

export interface PersistedCategories {
  version?: number
  /** v2: 按 folderId */
  folders?: Record<string, FolderCategoryConfig>
  /** v1 兼容 */
  ios?: CategorySection[]
  android?: CategorySection[]
}

/**
 * 从 manifest 资产列表 + 规则 生成默认分组（仅按语义一级分组，不按格式）
 */
export function buildDefaultSections(assets: AssetEntry[]): CategorySection[] {
  const bySemantic = new Map<string, string[]>()
  for (const a of assets) {
    const label = getSemanticLabel(a.name)
    if (!bySemantic.has(label)) bySemantic.set(label, [])
    bySemantic.get(label)!.push(a.id)
  }
  const sections: CategorySection[] = []
  const labels = Array.from(bySemantic.keys()).sort()
  for (const semanticLabel of labels) {
    const ids = bySemantic.get(semanticLabel)!
    const slug = semanticLabel.replace(/[/\s]+/g, '_')
    sections.push({
      id: `sem-${slug}`,
      format: '',
      semanticLabel,
      assetIds: ids,
    })
  }
  return sections
}

/**
 * 从持久化数据恢复分组；若有 manifest 中新增的资产则并入「未分类」
 */
export function applySavedSections(
  assets: AssetEntry[],
  saved: CategorySection[] | undefined
): CategorySection[] {
  if (!saved || saved.length === 0) return buildDefaultSections(assets)

  // 兼容「重新添加同一文件夹后 folderId 变化」：
  // 旧配置里的 assetId 可能仍是上一次会话生成的前缀，需按 path 后缀映射到当前 assetId。
  const toPathSuffix = (path: string) => `-${path.replace(/[/\\]/g, '_')}`
  const currentByPathSuffix = new Map<string, string>()
  for (const a of assets) currentByPathSuffix.set(toPathSuffix(a.path), a.id)

  const allIds = new Set(assets.map((a) => a.id))
  const normalizedSaved = saved.map((section) => {
    const mappedIds: string[] = []
    const seen = new Set<string>()
    for (const oldId of section.assetIds) {
      let nextId: string | null = null
      if (allIds.has(oldId)) {
        nextId = oldId
      } else {
        for (const [suffix, currentId] of currentByPathSuffix.entries()) {
          if (oldId.endsWith(suffix)) {
            nextId = currentId
            break
          }
        }
      }
      if (nextId && !seen.has(nextId)) {
        seen.add(nextId)
        mappedIds.push(nextId)
      }
    }
    return { ...section, assetIds: mappedIds }
  })

  const savedIds = new Set(normalizedSaved.flatMap((s) => s.assetIds))
  const newIds = [...allIds].filter((id) => !savedIds.has(id))
  if (newIds.length === 0) return normalizedSaved
  const unclassified = normalizedSaved.find((s) => s.semanticLabel === '未分类')
  if (unclassified) {
    const next = normalizedSaved.map((s) => ({ ...s, assetIds: [...s.assetIds] }))
    const u = next.find((s) => s.id === unclassified.id)!
    u.assetIds.push(...newIds)
    return next
  }
  return [...normalizedSaved, { id: 'sem-未分类-new', format: '', semanticLabel: '未分类', assetIds: newIds }]
}

export function sectionsToPersisted(platform: 'ios' | 'android', sections: CategorySection[]): PersistedCategories {
  return { [platform]: sections, version: 1 }
}

export function persistedToSections(data: PersistedCategories, platform: 'ios' | 'android'): CategorySection[] | undefined {
  return data[platform]
}

/** 无分组时默认展示：单一一级「未分类」包含全部资源 */
export function buildFormatOnlySections(assets: AssetEntry[]): CategorySection[] {
  if (assets.length === 0) return []
  return [{
    id: 'sem-未分类',
    format: '',
    semanticLabel: '未分类',
    assetIds: assets.map((a) => a.id),
  }]
}
