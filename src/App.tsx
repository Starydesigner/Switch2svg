import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import { Folder, FolderOpen, Save, Sparkles, Settings, X, Plus, ChevronDown, Search } from 'lucide-react'
import type { FoldersManifest, AssetEntry } from './types'
import { assetHasImagePreview, getAssetImageUrl } from './utils/assetUrl'
import {
  buildFormatOnlySections,
  buildDefaultSections,
  applySavedSections,
  type CategorySection,
  type FolderCategoryConfig,
} from './utils/categories'
import { AssetGrid, moveAssetsToSection } from './components/AssetGrid'
import { WelcomeGuide } from './components/WelcomeGuide'
import { SvgImage } from './components/SvgImage'
import { AssetThumbPlaceholder } from './components/AssetThumbPlaceholder'
import { SectionOutline } from './components/SectionOutline'
import {
  pickAnalysisFolderDirect,
  readFolderContentFromAccess,
  readFolderConfigFromAccess,
  loadReplacementPreviewsFromAccess,
  saveFolderConfigToSvgReplace,
  deleteReplacementFile,
  removeFolderFromAnalysisConfig,
  type LiveFolderAccess,
} from './utils/fsa'
import { blockingConfirm } from './utils/blockingConfirm'
import './App.css'

const AI_CONFIG_KEY = 'switch2svg-ai-config'
const THEME_KEY = 'switch2svg-theme'
const SVG_TINT_KEY = 'switch2svg-svg-tint'
const DEFAULT_SVG_TINT_COLOR = '#333333'

export interface SvgTintConfig {
  themeAdapt: boolean
  customColor: string
}

function loadSvgTintConfig(): SvgTintConfig {
  try {
    const v = localStorage.getItem(SVG_TINT_KEY)
    if (v) {
      if (v === 'white') return { themeAdapt: true, customColor: '' }
      if (v === 'black') return { themeAdapt: false, customColor: '#333333' }
      const o = JSON.parse(v)
      if (o && typeof o.themeAdapt === 'boolean') {
        return {
          themeAdapt: o.themeAdapt,
          customColor: typeof o.customColor === 'string' ? o.customColor : '',
        }
      }
    }
  } catch (_) {}
  return { themeAdapt: false, customColor: '' }
}

function parseHex(hex: string): string | null {
  const h = hex.trim().replace(/^#/, '').replace(/\s/g, '')
  if (!h) return null
  if (/^[0-9A-Fa-f]{6}$/.test(h)) return '#' + h.toLowerCase()
  if (/^[0-9A-Fa-f]{3}$/.test(h)) return '#' + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return null
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0.00 B'
  const k = 1024
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${['B', 'KB', 'MB', 'GB'][i]}`
}

/** 模糊匹配：query 的字符按顺序出现在 text 中（不区分大小写） */
function fuzzyMatch(query: string, text: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const t = text.toLowerCase()
  let j = 0
  for (let i = 0; i < q.length; i++) {
    const idx = t.indexOf(q[i], j)
    if (idx === -1) return false
    j = idx + 1
  }
  return true
}

function loadTheme(): 'light' | 'dark' {
  try {
    const t = localStorage.getItem(THEME_KEY)
    if (t === 'dark' || t === 'light') return t
  } catch (_) {}
  return 'light'
}

/** 阿里千问大模型 API 配置（用于 AI 分析时的语义分组，不填则使用内置规则分组） */
export interface AIConfig {
  apiKey: string
  model: string
}

function loadAIConfig(): AIConfig {
  try {
    const s = localStorage.getItem(AI_CONFIG_KEY)
    if (s) {
      const o = JSON.parse(s)
      return {
        apiKey: o.apiKey ?? '',
        model: o.model ?? 'qwen-turbo',
      }
    }
  } catch (_) {}
  return { apiKey: '', model: 'qwen-turbo' }
}

/** 仅使用 manifest 中的 folders，不注入默认 ios/android */
function normalizeManifest(data: any): FoldersManifest {
  if (data && Array.isArray(data.folders)) return { folders: data.folders }
  return { folders: [] }
}

function App() {
  const [manifest, setManifest] = useState<FoldersManifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [categoriesByFolderId, setCategoriesByFolderId] = useState<Record<string, FolderCategoryConfig>>({})
  /** 通过「选择文件夹」即时读取的文件夹（无需 build-manifest 即可查看） */
  const [liveFolders, setLiveFolders] = useState<FoldersManifest['folders']>([])
  /** 当前会话中直接选择的文件夹（FSA handle 或 Tauri 绝对路径），用于保存/上传时不再弹窗 */
  const liveFolderAccessRef = useRef<Record<string, LiveFolderAccess>>({})
  /** 已从列表中移除的 manifest 文件夹名称（已从 analysis-folders 配置中删除，需过滤展示） */
  const [removedFolderNames, setRemovedFolderNames] = useState<Set<string>>(new Set())
  const [addFolderLoading, setAddFolderLoading] = useState(false)
  const [showAIConfig, setShowAIConfig] = useState(false)
  const [aiConfig, setAIConfig] = useState<AIConfig>(loadAIConfig)
  const [theme, setTheme] = useState<'light' | 'dark'>(loadTheme)
  const [svgTintConfig, setSvgTintConfig] = useState<SvgTintConfig>(loadSvgTintConfig)
  const [showSvgTintModal, setShowSvgTintModal] = useState(false)
  /** 当前文件夹下各分组的替换图：sectionId -> ReplacementItem[]（可多张） */
  const [replacementsByFolderId, setReplacementsByFolderId] = useState<Record<string, Record<string, import('./types').ReplacementItem[]>>>({})

  const fetchManifest = () => {
    return fetch('/assets-manifest.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Failed to load manifest'))))
      .then((data) => {
        const next = normalizeManifest(data)
        setManifest(next)
        setError(null)
        if (next.folders.length > 0 && !selectedFolderId) {
          setSelectedFolderId(next.folders[0].id)
        }
        if (selectedFolderId && !next.folders.some((f) => f.id === selectedFolderId)) {
          setSelectedFolderId(next.folders[0]?.id ?? null)
        }
      })
      .catch((e) => setError(e?.message || '加载清单失败'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchManifest()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch (_) {}
  }, [theme])

  const effectiveSvgTintColor = useMemo(() => {
    if (svgTintConfig.themeAdapt) return theme === 'dark' ? '#ffffff' : '#333333'
    return parseHex(svgTintConfig.customColor) || DEFAULT_SVG_TINT_COLOR
  }, [svgTintConfig.themeAdapt, svgTintConfig.customColor, theme])

  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--svg-tint-color', effectiveSvgTintColor)
  }, [effectiveSvgTintColor])

  useEffect(() => {
    try {
      localStorage.setItem(SVG_TINT_KEY, JSON.stringify(svgTintConfig))
    } catch (_) {}
  }, [svgTintConfig])

  const allFolders = useMemo(() => {
    const fromManifest = (manifest?.folders ?? []).filter((f) => !removedFolderNames.has(f.name))
    return [...fromManifest, ...liveFolders]
  }, [manifest?.folders, liveFolders, removedFolderNames])
  const currentFolder = useMemo(() => {
    if (!allFolders.length || !selectedFolderId) return null
    return allFolders.find((f) => f.id === selectedFolderId) ?? allFolders[0]
  }, [allFolders, selectedFolderId])

  const assets = currentFolder?.assets ?? []
  const folderConfig = currentFolder ? categoriesByFolderId[currentFolder.id] : null
  const sections = folderConfig?.sections ?? []

  const displaySections = useMemo(() => {
    if (assets.length === 0) return []
    if (sections.length > 0) return applySavedSections(assets, sections)
    return buildFormatOnlySections(assets)
  }, [assets, sections])

  const setFolderConfig = (next: FolderCategoryConfig) => {
    if (!currentFolder) return
    setCategoriesByFolderId((prev) => ({ ...prev, [currentFolder.id]: next }))
  }

  /** 智能分组：已配置千问 API 时可用大模型语义分组，否则使用内置规则（按文件名关键词）分组 */
  const handleRunAIAnalysis = async () => {
    if (!currentFolder) return
    if (
      !(await blockingConfirm(
        '将依据元素命名自动归类分组，当前已创建分组会消失，请谨慎操作',
        '自动语义分组'
      ))
    )
      return
    setFolderConfig({ mode: 'auto', sections: buildDefaultSections(assets) })
  }

  const [newSectionIdToFocus, setNewSectionIdToFocus] = useState<string | null>(null)
  /** 左侧面板选中的素材 id（与 AssetGrid 吸顶栏「移动分组」联动） */
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())
  const [showMoveToSectionDropdown, setShowMoveToSectionDropdown] = useState(false)
  /** 顶栏搜索：关键词、下拉是否展开、结果中选中的 id */
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchSelectedIds, setSearchSelectedIds] = useState<Set<string>>(new Set())
  const searchRef = useRef<HTMLDivElement>(null)

  /** 展示顺序：未分类始终在最后 */
  const displayOrderSections = useMemo(
    () => [
      ...displaySections.filter((s) => (s.semanticLabel || '') !== '未分类'),
      ...displaySections.filter((s) => (s.semanticLabel || '') === '未分类'),
    ],
    [displaySections]
  )

  /** 素材 id -> 所属分组（用于搜索结果展示） */
  const assetIdToSection = useMemo(() => {
    const m = new Map<string, CategorySection>()
    for (const s of displaySections) {
      for (const id of s.assetIds) m.set(id, s)
    }
    return m
  }, [displaySections])

  /** 搜索模糊匹配结果 */
  const searchFilteredAssets = useMemo(() => {
    const q = searchQuery.trim()
    if (!q || !assets.length) return []
    return assets.filter((a) => fuzzyMatch(q, a.name) || fuzzyMatch(q, a.path))
  }, [searchQuery, assets])

  /** 搜索结果按分组聚合，顺序与 displayOrderSections 一致；无分组的归为「未分类」 */
  const searchFilteredBySection = useMemo(() => {
    if (!searchFilteredAssets.length) return []
    const sectionIdToAssets = new Map<string, AssetEntry[]>()
    const unclassified: AssetEntry[] = []
    for (const asset of searchFilteredAssets) {
      const sec = assetIdToSection.get(asset.id)
      if (!sec) unclassified.push(asset)
      else {
        const arr = sectionIdToAssets.get(sec.id) ?? []
        arr.push(asset)
        sectionIdToAssets.set(sec.id, arr)
      }
    }
    const grouped: { section: CategorySection | null; assets: AssetEntry[] }[] = []
    for (const s of displayOrderSections) {
      const list = sectionIdToAssets.get(s.id)
      if (list?.length) grouped.push({ section: s, assets: list })
    }
    if (unclassified.length) grouped.push({ section: null, assets: unclassified })
    return grouped
  }, [searchFilteredAssets, displayOrderSections, assetIdToSection])

  /** 点击搜索框外关闭下拉 */
  useEffect(() => {
    if (!searchOpen) return
    const onMouseDown = (e: MouseEvent) => {
      if (searchRef.current?.contains(e.target as Node)) return
      setSearchOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [searchOpen])

  const moveSearchSelectedToSection = useCallback(
    (toSectionId: string) => {
      const ids = Array.from(searchSelectedIds)
      if (ids.length === 0) return
      moveAssetsToSection(displaySections, ids, toSectionId, handleSectionsChange)
      setSearchSelectedIds(new Set())
    },
    [searchSelectedIds, displaySections]
  )

  /** 将搜索中选中的素材归到新分组：创建新分组并移动选中项 */
  const moveSearchSelectedToNewSection = useCallback(() => {
    const ids = Array.from(searchSelectedIds)
    if (ids.length === 0 || !currentFolder) return
    const newSection: CategorySection = {
      id: `manual-${Date.now()}`,
      format: 'manual',
      semanticLabel: '新分组',
      assetIds: [...ids],
    }
    const idSet = new Set(ids)
    const restSections = sections.map((s) => ({
      ...s,
      assetIds: s.assetIds.filter((id) => !idSet.has(id)),
    }))
    setFolderConfig({ mode: folderConfig?.mode ?? 'manual', sections: [newSection, ...restSections] })
    setNewSectionIdToFocus(newSection.id)
    setSearchSelectedIds(new Set())
  }, [searchSelectedIds, currentFolder, sections, folderConfig?.mode])

  /** 顶栏统计：原素材总大小、按分组 replaceMode 计算预计减少素材包大小（随 sections/replaceMode/replacements 实时更新） */
  const sizeStats = useMemo(() => {
    if (!currentFolder || assets.length === 0) return null
    const replacements = replacementsByFolderId[currentFolder.id] ?? {}
    const originalTotal = assets.reduce((sum, a) => sum + (a.size ?? 0), 0)
    let reductionTotal = 0
    for (const section of displaySections) {
      const mode = section.replaceMode ?? 'replace'
      const sectionOriginal = section.assetIds.reduce(
        (sum, id) => sum + (assets.find((a) => a.id === id)?.size ?? 0),
        0
      )
      if (mode === 'keep') {
        reductionTotal += 0
      } else if (mode === 'delete') {
        reductionTotal += sectionOriginal
      } else {
        const reps = replacements[section.id] ?? []
        const replacementTotal = reps.reduce((s, r) => s + (r.size ?? 0), 0)
        reductionTotal += Math.max(0, sectionOriginal - replacementTotal)
      }
    }
    return {
      originalTotal,
      reductionTotal,
      hasAnySize: originalTotal > 0 || reductionTotal > 0,
    }
  }, [currentFolder, assets, sections, displaySections, replacementsByFolderId])

  const moveSelectedToSection = useCallback(
    (toSectionId: string) => {
      const ids = Array.from(selectedAssetIds)
      if (ids.length === 0) return
      moveAssetsToSection(displaySections, ids, toSectionId, handleSectionsChange)
      setSelectedAssetIds(new Set())
      setShowMoveToSectionDropdown(false)
    },
    [selectedAssetIds, displaySections]
  )

  /** 将当前选中的素材归到新分组：创建新分组并移动选中项 */
  const moveSelectedToNewSection = useCallback(() => {
    const ids = Array.from(selectedAssetIds)
    if (ids.length === 0 || !currentFolder) return
    const newSection: CategorySection = {
      id: `manual-${Date.now()}`,
      format: 'manual',
      semanticLabel: '新分组',
      assetIds: [...ids],
    }
    const idSet = new Set(ids)
    const restSections = sections.map((s) => ({
      ...s,
      assetIds: s.assetIds.filter((id) => !idSet.has(id)),
    }))
    setFolderConfig({ mode: folderConfig?.mode ?? 'manual', sections: [newSection, ...restSections] })
    setNewSectionIdToFocus(newSection.id)
    setSelectedAssetIds(new Set())
    setShowMoveToSectionDropdown(false)
  }, [selectedAssetIds, currentFolder, sections, folderConfig?.mode])

  const handleAddManualGroup = () => {
    if (!currentFolder) return
    const next: CategorySection = {
      id: `manual-${Date.now()}`,
      format: 'manual',
      semanticLabel: '新分组',
      assetIds: [],
    }
    setFolderConfig({
      mode: folderConfig?.mode ?? 'manual',
      sections: [next, ...sections],
    })
    setNewSectionIdToFocus(next.id)
  }

  const handleSectionRename = (sectionId: string, semanticLabel: string) => {
    if (!currentFolder) return
    const next = sections.map((s) =>
      s.id === sectionId ? { ...s, semanticLabel: semanticLabel.trim() || '未分类' } : s
    )
    setFolderConfig({ mode: folderConfig?.mode ?? 'manual', sections: next })
  }

  const handleSectionsChange = (next: CategorySection[]) => {
    if (!currentFolder) return
    setFolderConfig({ mode: folderConfig?.mode ?? 'manual', sections: next })
  }

  const handleSectionReplaceModeChange = useCallback(
    (sectionId: string, replaceMode: import('./utils/categories').SectionReplaceMode) => {
      if (!currentFolder) return
      const next = sections.map((s) =>
        s.id === sectionId ? { ...s, replaceMode } : s
      )
      setFolderConfig({ mode: folderConfig?.mode ?? 'manual', sections: next })
    },
    [currentFolder, sections, folderConfig?.mode]
  )

  /** 左侧大纲拖拽排序后，直接更新分组顺序并保持未分类在最后 */
  const handleOutlineReorder = useCallback(
    (newOrder: CategorySection[]) => {
      if (!currentFolder) return
      setFolderConfig({ mode: folderConfig?.mode ?? 'manual', sections: newOrder })
    },
    [currentFolder, folderConfig?.mode]
  )

  /** 点击左侧大纲分组项，滚动到对应分组卡片 */
  const handleOutlineSectionClick = useCallback((sectionId: string) => {
    document.getElementById(`section-${sectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleSectionDelete = async (sectionId: string) => {
    if (!currentFolder) return
    const sourceSections = categoriesByFolderId[currentFolder.id]?.sections ?? displaySections
    const target = sourceSections.find((s) => s.id === sectionId)
    if (!target) return
    if ((target.semanticLabel || '') === '未分类') return
    if (!(await blockingConfirm(`确定删除分组「${target.semanticLabel || '未分类'}」吗？`, '删除分组')))
      return

    const rest = sourceSections.filter((s) => s.id !== sectionId).map((s) => ({ ...s, assetIds: [...s.assetIds] }))
    if (target.assetIds.length > 0) {
      const unclassified = rest.find((s) => s.semanticLabel === '未分类')
      if (unclassified) {
        unclassified.assetIds.push(...target.assetIds.filter((id) => !unclassified.assetIds.includes(id)))
      } else {
        rest.push({
          id: `sem-未分类-${Date.now()}`,
          format: '',
          semanticLabel: '未分类',
          assetIds: [...target.assetIds],
        })
      }
    }
    setFolderConfig({ mode: folderConfig?.mode ?? 'manual', sections: rest })

    setReplacementsByFolderId((prev) => {
      const folderItems = { ...(prev[currentFolder.id] ?? {}) }
      delete folderItems[sectionId]
      return { ...prev, [currentFolder.id]: folderItems }
    })
  }

  const handleSave = () => {
    if (!currentFolder) return
    const sections = categoriesByFolderId[currentFolder.id]?.sections ?? displaySections
    const replacements = replacementsByFolderId[currentFolder.id] ?? {}
    const replacementsMap: Record<string, string[]> = {}
    Object.entries(replacements).forEach(([sectionId, items]) => {
      replacementsMap[sectionId] = items.map((i) => i.filename)
    })
    const folderAccess = liveFolderAccessRef.current[currentFolder.id]
    saveFolderConfigToSvgReplace(currentFolder.name, { sections, replacements: replacementsMap }, folderAccess)
      .then(() => alert('已保存配置到分析文件夹下 Svg_replace 文件夹中。下次打开分析文件夹将自动读取配置。'))
      .catch((err) => alert('保存失败: ' + (err?.message || err)))
  }

  const handleReplacementUploaded = (sectionId: string, item: import('./types').ReplacementItem) => {
    if (!currentFolder) return
    setReplacementsByFolderId((prev) => ({
      ...prev,
      [currentFolder.id]: {
        ...(prev[currentFolder.id] ?? {}),
        [sectionId]: [...(prev[currentFolder.id]?.[sectionId] ?? []), item],
      },
    }))
  }

  const handleReplacementDelete = (sectionId: string, itemId: string) => {
    if (!currentFolder) return
    const folderItems = replacementsByFolderId[currentFolder.id] ?? {}
    const list = folderItems[sectionId] ?? []
    const item = list.find((i) => i.id === itemId)
    if (item?.filename) {
      const folderAccess = liveFolderAccessRef.current[currentFolder.id]
      if (folderAccess) {
        deleteReplacementFile(folderAccess, item.filename).catch((err) =>
          console.warn('删除 Svg_replace 内文件失败:', err?.message || err)
        )
      }
    }
    setReplacementsByFolderId((prev) => {
      const next = { ...prev, [currentFolder!.id]: { ...(prev[currentFolder!.id] ?? {}) } }
      const nextList = (next[currentFolder!.id][sectionId] ?? []).filter((i) => i.id !== itemId)
      if (nextList.length) next[currentFolder!.id][sectionId] = nextList
      else delete next[currentFolder!.id][sectionId]
      return next
    })
  }

  const handleReplacementMove = (fromSectionId: string, itemId: string, toSectionId: string) => {
    if (!currentFolder || fromSectionId === toSectionId) return
    const items = replacementsByFolderId[currentFolder.id] ?? {}
    const fromList = items[fromSectionId] ?? []
    const item = fromList.find((i) => i.id === itemId)
    if (!item) return
    setReplacementsByFolderId((prev) => {
      const next = { ...prev, [currentFolder!.id]: { ...(prev[currentFolder!.id] ?? {}) } }
      next[currentFolder!.id][fromSectionId] = (next[currentFolder!.id][fromSectionId] ?? []).filter((i) => i.id !== itemId)
      next[currentFolder!.id][toSectionId] = [...(next[currentFolder!.id][toSectionId] ?? []), item]
      return next
    })
  }

  const handleOpenAddFolder = async () => {
    const existingNames = allFolders.map((f) => f.name)
    setAddFolderLoading(true)
    try {
      const { access, folderName } = await pickAnalysisFolderDirect()
      if (existingNames.includes(folderName)) {
        alert('该文件夹已在列表中')
        return
      }
      const folderId = `live_${folderName.replace(/\W/g, '_')}_${Date.now()}`
      const folderManifest = await readFolderContentFromAccess(access, folderName, folderId)
      liveFolderAccessRef.current[folderId] = access
      setLiveFolders((prev) => [...prev, folderManifest])
      setSelectedFolderId(folderId)

      const savedConfig = await readFolderConfigFromAccess(access)
      let appliedSections: CategorySection[] | null = null
      if (savedConfig?.sections?.length) {
        appliedSections = applySavedSections(folderManifest.assets, savedConfig.sections)
        const sectionsForFolder = appliedSections
        setCategoriesByFolderId((prev) => ({
          ...prev,
          [folderId]: { mode: 'manual', sections: sectionsForFolder },
        }))
      }
      if (savedConfig?.replacements && Object.keys(savedConfig.replacements).length > 0) {
        const itemsBySection = await loadReplacementPreviewsFromAccess(access, savedConfig.replacements)
        // 用当前要展示的 section id 对齐，避免 config 与展示的 section id 不一致导致预览不显示
        const alignedReplacements: Record<string, import('./types').ReplacementItem[]> = {}
        if (appliedSections && appliedSections.length > 0) {
          for (const sec of appliedSections) {
            alignedReplacements[sec.id] = itemsBySection[sec.id] ?? []
          }
        } else {
          Object.assign(alignedReplacements, itemsBySection)
        }
        setReplacementsByFolderId((prev) => ({ ...prev, [folderId]: alignedReplacements }))
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') alert(err?.message || '选择或读取失败')
    } finally {
      setAddFolderLoading(false)
    }
  }

  const handleDeleteFolder = async (folderId: string, folderName: string, isLive: boolean) => {
    if (!(await blockingConfirm(`确定要移除「${folderName}」吗？`, '移除文件夹'))) return
    if (selectedFolderId === folderId) {
      const rest = allFolders.filter((f) => f.id !== folderId)
      setSelectedFolderId(rest[0]?.id ?? null)
    }
    if (isLive) {
      const folder = liveFolders.find((f) => f.id === folderId)
      if (folder) {
        folder.assets.forEach((a) => { if (a.displayUrl) URL.revokeObjectURL(a.displayUrl) })
        setLiveFolders((prev) => prev.filter((f) => f.id !== folderId))
        delete liveFolderAccessRef.current[folderId]
      }
    } else {
      setRemovedFolderNames((prev) => new Set(prev).add(folderName))
      removeFolderFromAnalysisConfig(folderName).catch((err) =>
        alert(err?.message || '从配置中移除失败')
      )
    }
  }

  const saveAIConfig = () => {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(aiConfig))
    setShowAIConfig(false)
  }

  useEffect(() => {
    if (!currentFolder) return
    const folderAccess = liveFolderAccessRef.current[currentFolder.id]
    if (!folderAccess) return

    const sectionsToSave = categoriesByFolderId[currentFolder.id]?.sections ?? displaySections
    const replacements = replacementsByFolderId[currentFolder.id] ?? {}
    const replacementsMap: Record<string, string[]> = {}
    Object.entries(replacements).forEach(([sectionId, items]) => {
      replacementsMap[sectionId] = items.map((i) => i.filename)
    })

    const timer = window.setTimeout(() => {
      saveFolderConfigToSvgReplace(
        currentFolder.name,
        { sections: sectionsToSave, replacements: replacementsMap },
        folderAccess
      ).catch((err) => {
        console.error('Auto save config failed:', err)
      })
    }, 500)

    return () => window.clearTimeout(timer)
  }, [currentFolder, categoriesByFolderId, displaySections, replacementsByFolderId])

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">APP图标治理工具</h1>
        <div className="header-tabs-row">
          <nav className="tabs">
            {allFolders.map((f) => {
              const isLive = f.id.startsWith('live_')
              const isActive = selectedFolderId === f.id
              return (
                <span
                  key={f.id}
                  className={`tab-wrap ${isActive ? 'active' : ''}`}
                >
                  <button
                    type="button"
                    className="tab"
                    onClick={() => setSelectedFolderId(f.id)}
                  >
                    <Folder size={14} strokeWidth={2} />
                    {f.name}
                  </button>
                  <button
                    type="button"
                    className="tab-remove"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id, f.name, isLive); }}
                    title="移除该文件夹"
                    aria-label="移除"
                  >
                    <X size={12} strokeWidth={2} />
                  </button>
                </span>
              )
            })}
          </nav>
          <button type="button" className="save-btn secondary" onClick={handleOpenAddFolder} disabled={addFolderLoading}>
            <FolderOpen size={16} strokeWidth={2} />
            {addFolderLoading ? '读取中…' : '选择文件夹'}
          </button>
        </div>
        <button
          type="button"
          className="svg-tint-btn"
          onClick={() => setShowSvgTintModal(true)}
          aria-label="SVG 改色设置"
          title="SVG 改色"
        >
          <span className="svg-tint-btn-dot" style={{ backgroundColor: effectiveSvgTintColor }} />
          SVG 改色
        </button>
        <div className="theme-switch" role="group" aria-label="主题">
          <button
            type="button"
            className={`theme-option ${theme === 'light' ? 'active' : ''}`}
            onClick={() => setTheme('light')}
            aria-pressed={theme === 'light'}
          >
            亮色
          </button>
          <button
            type="button"
            className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
            onClick={() => setTheme('dark')}
            aria-pressed={theme === 'dark'}
          >
            暗色
          </button>
        </div>
      </header>

      {showSvgTintModal && (
        <div className="modal-overlay" onClick={() => setShowSvgTintModal(false)}>
          <div className="modal svg-tint-modal" onClick={(e) => e.stopPropagation()}>
            <h3>SVG 改色</h3>
            <label className="config-row config-row-switch">
              <span className="config-label">跟随亮色/暗色适配</span>
              <input
                type="checkbox"
                className="svg-tint-theme-adapt-checkbox"
                checked={svgTintConfig.themeAdapt}
                onChange={(e) => setSvgTintConfig((c) => ({ ...c, themeAdapt: e.target.checked }))}
                aria-label="跟随亮色/暗色适配"
              />
            </label>
            {svgTintConfig.themeAdapt && (
              <p className="modal-hint svg-tint-hint">开启后：暗色主题下为 #ffffff，亮色主题下为 #333333。</p>
            )}
            {!svgTintConfig.themeAdapt && (
              <label className="config-row">
                <span className="config-label">自定义颜色</span>
                <input
                  type="text"
                  className="modal-input svg-tint-hex-input"
                  value={svgTintConfig.customColor}
                  onChange={(e) => setSvgTintConfig((c) => ({ ...c, customColor: e.target.value }))}
                  placeholder={DEFAULT_SVG_TINT_COLOR}
                  aria-label="色号（如 #333333）"
                />
              </label>
            )}
            {!svgTintConfig.themeAdapt && (
              <p className="modal-hint svg-tint-hint">
                未输入时使用默认颜色 {DEFAULT_SVG_TINT_COLOR}。支持 #333333 或 #333 格式。
              </p>
            )}
            <div className="modal-actions">
              <button type="button" className="save-btn" onClick={() => setShowSvgTintModal(false)}>
                <Save size={14} strokeWidth={2} />
                保存设置
              </button>
            </div>
          </div>
        </div>
      )}

      {showAIConfig && (
        <div className="modal-overlay" onClick={() => setShowAIConfig(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>阿里千问 API 配置</h3>
            <p className="modal-hint">用于「自动语义分组」时的语义分组。不填写则使用内置规则（按文件名关键词）分组，无需 API。</p>
            <label className="config-row">
              <span className="config-label">API Key</span>
              <input
                type="password"
                className="modal-input"
                value={aiConfig.apiKey}
                onChange={(e) => setAIConfig((c) => ({ ...c, apiKey: e.target.value }))}
                placeholder="阿里云百炼 / DashScope 控制台获取"
              />
            </label>
            <label className="config-row">
              <span className="config-label">模型</span>
              <select
                className="modal-input"
                value={aiConfig.model}
                onChange={(e) => setAIConfig((c) => ({ ...c, model: e.target.value }))}
              >
                <option value="qwen-turbo">qwen-turbo</option>
                <option value="qwen-plus">qwen-plus</option>
                <option value="qwen-max">qwen-max</option>
                <option value="qwen-long">qwen-long</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="save-btn secondary" onClick={() => setShowAIConfig(false)}>取消</button>
              <button type="button" className="save-btn" onClick={saveAIConfig}><Save size={14} strokeWidth={2} /> 保存</button>
            </div>
          </div>
        </div>
      )}

      <main className="main">
        {loading && <p className="status">加载资源清单中…</p>}
        {error && <p className="status error">{error}</p>}
        {!loading && !error && allFolders.length === 0 && (
          <div className="welcome-scroll">
            <WelcomeGuide onPickFolder={() => { void handleOpenAddFolder() }} picking={addFolderLoading} />
          </div>
        )}
        {!loading && !error && currentFolder && (
          <div className="content">
            <section className="left-panel">
              <div className="left-panel-sticky-bar">
                <div className="left-panel-sticky-actions">
                  <div className="left-panel-sticky-left">
                    <button type="button" className="save-btn secondary small" onClick={handleAddManualGroup}>
                      <Plus size={14} strokeWidth={2} />
                      新建分组
                    </button>
                    <button type="button" className="save-btn secondary small" onClick={handleRunAIAnalysis} title="按规则或千问大模型对资源做语义分组">
                      <Sparkles size={14} strokeWidth={2} />
                      自动语义分组
                    </button>
                    <button type="button" className="save-btn secondary small" onClick={() => setShowAIConfig(true)}>
                      <Settings size={14} strokeWidth={2} />
                      AI 配置
                    </button>
                  </div>
                  <div className="left-panel-search-wrap" ref={searchRef}>
                    <div className="left-panel-search-input-wrap">
                      <Search size={16} strokeWidth={2} className="left-panel-search-icon" aria-hidden />
                      <input
                        type="text"
                        className="left-panel-search-input"
                        placeholder="搜索素材"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        onFocus={() => setSearchOpen(true)}
                        aria-label="搜索素材"
                        aria-expanded={searchOpen}
                        aria-haspopup="listbox"
                      />
                      {searchQuery.length > 0 && (
                        <button
                          type="button"
                          className="left-panel-search-clear"
                          onClick={() => setSearchQuery('')}
                          aria-label="清空输入"
                        >
                          <X size={14} strokeWidth={2} />
                        </button>
                      )}
                    </div>
                    {searchOpen && (
                      <div className="left-panel-search-dropdown" role="listbox">
                        {searchFilteredAssets.length === 0 ? (
                          <div className="left-panel-search-empty">
                            {searchQuery.trim() ? '无匹配素材' : '输入关键词模糊匹配'}
                          </div>
                        ) : (
                          <>
                            <div className="left-panel-search-results-scroll">
                              {searchFilteredBySection.map(({ section, assets: groupAssets }) => (
                                <div
                                  key={section?.id ?? 'unclassified'}
                                  className="left-panel-search-group"
                                >
                                  <div className="left-panel-search-group-title">
                                    {section?.semanticLabel ?? '未分类'}
                                  </div>
                                  <div className="left-panel-search-results">
                                    {groupAssets.map((asset) => {
                                      const checked = searchSelectedIds.has(asset.id)
                                      return (
                                        <div
                                          key={asset.id}
                                          className="left-panel-search-result-item"
                                          role="option"
                                          aria-selected={checked}
                                          onClick={() => {
                                            setSearchSelectedIds((prev) => {
                                              const next = new Set(prev)
                                              if (next.has(asset.id)) next.delete(asset.id)
                                              else next.add(asset.id)
                                              return next
                                            })
                                          }}
                                        >
                                          <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={(e) => {
                                              e.stopPropagation()
                                              setSearchSelectedIds((prev) => {
                                                const next = new Set(prev)
                                                if (next.has(asset.id)) next.delete(asset.id)
                                                else next.add(asset.id)
                                                return next
                                              })
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            aria-hidden
                                            className="left-panel-search-result-check"
                                          />
                                          <div className="left-panel-search-result-thumb">
                                            {asset.format === 'lottie' ? (
                                              <span className="thumb-placeholder">Lottie</span>
                                            ) : !assetHasImagePreview(asset) ? (
                                              <AssetThumbPlaceholder />
                                            ) : (asset.format || '').toLowerCase() === 'svg' ||
                                              (asset.path || '').toLowerCase().endsWith('.svg') ? (
                                              <SvgImage src={getAssetImageUrl(asset)} alt="" />
                                            ) : (
                                              <img src={getAssetImageUrl(asset)} alt="" />
                                            )}
                                          </div>
                                          <div className="left-panel-search-result-info">
                                            <span className="left-panel-search-result-name">{asset.name}</span>
                                            <span className="left-panel-search-result-section">
                                              {section?.semanticLabel ?? '未分类'}
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="left-panel-search-actions">
                              <span className="left-panel-search-selected-count">已选 {searchSelectedIds.size} 项</span>
                              <div className="left-panel-search-move-wrap">
                                <select
                                  className="left-panel-search-move-select"
                                  aria-label="选择目标分组"
                                  disabled={searchSelectedIds.size === 0}
                                  onChange={(e) => {
                                    const id = e.target.value
                                    if (id) {
                                      if (id === '__new__') moveSearchSelectedToNewSection()
                                      else moveSearchSelectedToSection(id)
                                      e.target.value = ''
                                    }
                                  }}
                                  defaultValue=""
                                >
                                  <option value="">移动到分组…</option>
                                  <option value="__new__">归到新分组</option>
                                  {displayOrderSections.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.semanticLabel || '未命名'}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {sizeStats?.hasAnySize && (
                    <div className="left-panel-sticky-stats" aria-label="文件大小统计">
                      <span className="left-panel-sticky-stats-item">
                        原素材：<strong>{formatBytes(sizeStats.originalTotal)}</strong>
                      </span>
                      <span className="left-panel-sticky-stats-item">
                        预计减少素材包：<strong>{formatBytes(sizeStats.reductionTotal)}</strong>
                      </span>
                    </div>
                  )}
                  <div className="left-panel-sticky-right">
                    <button type="button" className="save-btn small" onClick={handleSave} disabled={!currentFolder}>
                      <Save size={14} strokeWidth={2} />
                      保存到项目
                    </button>
                  </div>
                </div>
              </div>
              <div className="left-panel-body">
                <SectionOutline
                  sections={displayOrderSections}
                  onReorder={handleOutlineReorder}
                  onSectionClick={handleOutlineSectionClick}
                />
                <div className="left-panel-main">
                  <AssetGrid
                assets={assets}
                sections={displaySections}
                onSectionsChange={handleSectionsChange}
                folderName={currentFolder.name}
                folderAccess={liveFolderAccessRef.current[currentFolder.id]}
                replacements={replacementsByFolderId[currentFolder.id] ?? {}}
                onReplacementUploaded={handleReplacementUploaded}
                onReplacementDelete={handleReplacementDelete}
                onReplacementMove={handleReplacementMove}
                onAddManualGroup={handleAddManualGroup}
                onSectionRename={handleSectionRename}
                onSectionDelete={handleSectionDelete}
                newSectionIdToFocus={newSectionIdToFocus}
                onClearNewSectionIdToFocus={() => setNewSectionIdToFocus(null)}
                selectedAssetIds={selectedAssetIds}
                onSelectionChange={setSelectedAssetIds}
                onMoveSelectedToSection={moveSelectedToSection}
                onSectionReplaceModeChange={handleSectionReplaceModeChange}
                  />
                </div>
              </div>
              {selectedAssetIds.size > 0 && (
                <div className="selection-capsule">
                  <span className="selection-capsule-count">已选 {selectedAssetIds.size} 项</span>
                  <div className="selection-capsule-move-wrap">
                    <button
                      type="button"
                      className="selection-capsule-btn"
                      onClick={() => setShowMoveToSectionDropdown((v) => !v)}
                      aria-expanded={showMoveToSectionDropdown}
                      aria-haspopup="true"
                    >
                      移动分组
                      <ChevronDown size={14} strokeWidth={2} />
                    </button>
                    {showMoveToSectionDropdown && (
                      <>
                        <div
                          className="move-to-section-backdrop"
                          aria-hidden
                          onClick={() => setShowMoveToSectionDropdown(false)}
                        />
                        <div className="move-to-section-dropdown selection-capsule-dropdown" role="listbox">
                          <button
                            type="button"
                            className="move-to-section-option move-to-section-option-new"
                            role="option"
                            onClick={() => moveSelectedToNewSection()}
                          >
                            归到新分组
                          </button>
                          {displayOrderSections.map((section) => (
                            <button
                              key={section.id}
                              type="button"
                              className="move-to-section-option"
                              role="option"
                              onClick={() => moveSelectedToSection(section.id)}
                            >
                              {section.semanticLabel || '未命名'}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    className="selection-capsule-btn"
                    onClick={() => setSelectedAssetIds(new Set())}
                  >
                    取消选择
                  </button>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
