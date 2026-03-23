import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import {
  Folder,
  FolderOpen,
  Save,
  Sparkles,
  X,
  Plus,
  Search,
  Link,
  Copy,
  FolderInput,
  Trash2,
  ImagePlus,
  ChevronDown,
} from 'lucide-react'
import type { FoldersManifest, AssetEntry, FolderManifest } from './types'
import bundledAssetsManifest from './assets-manifest.json'
import {
  assetHasImagePreview,
  isHttpImageAsset,
  isImageListingAsset,
  buildSelectedAssetsClipboardText,
  remoteHttpImageProps,
} from './utils/assetUrl'
import { useRemotePreviewSrc } from './utils/remoteHttpPreview'
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
  pickParentDirectoryTauri,
  createRemoteAnalysisBundleTauri,
  readFolderContentFromAccess,
  readFolderConfigFromAccess,
  loadReplacementPreviewsFromAccess,
  saveFolderConfigToSvgReplace,
  deleteReplacementFile,
  removeFolderFromAnalysisConfig,
  type LiveFolderAccess,
} from './utils/fsa'
import { blockingConfirm } from './utils/blockingConfirm'
import {
  extractImageUrlsFromTextDetailed,
  buildFolderManifestFromRemoteUrls,
  buildRemoteAssetEntriesFromUrls,
} from './utils/remoteImageUrls'
import './App.css'

const THEME_KEY = 'switch2svg-theme'
const SVG_TINT_KEY = 'switch2svg-svg-tint'
const DEFAULT_SVG_TINT_COLOR = '#333333'

function LeftSearchResultThumb({ asset }: { asset: AssetEntry }) {
  const { src, pending, failed } = useRemotePreviewSrc(asset)
  if (asset.format === 'lottie') {
    return <span className="thumb-placeholder">Lottie</span>
  }
  if (!assetHasImagePreview(asset)) {
    return <AssetThumbPlaceholder />
  }
  if (pending) {
    return <AssetThumbPlaceholder title="加载中" />
  }
  if (failed) {
    return <span className="thumb-placeholder">?</span>
  }
  if (
    (asset.format || '').toLowerCase() === 'svg' ||
    (asset.path || '').toLowerCase().endsWith('.svg')
  ) {
    return <SvgImage src={src} alt="" {...remoteHttpImageProps(asset.displayUrl || src)} />
  }
  return <img src={src} alt="" {...remoteHttpImageProps(asset.displayUrl || src)} />
}

/** 图床/链接分组：标签链式图标、右键复制地址 */
function folderRemoteBedStyle(folder: FolderManifest): boolean {
  if (folder.sourceKind === 'remote-bed') return true
  if (folder.id.startsWith('live_remote_')) return true
  if (!folder.assets.length) return false
  return folder.assets.every((a) => isHttpImageAsset(a))
}

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
  const [showAddProjectDropdown, setShowAddProjectDropdown] = useState(false)
  const addProjectDropdownRef = useRef<HTMLDivElement>(null)
  const [showRemoteBedModal, setShowRemoteBedModal] = useState(false)
  /** 非 null 时表示在「当前远程文件夹」内追加链接，而非新建标签 */
  const [remoteBedAppendFolderId, setRemoteBedAppendFolderId] = useState<string | null>(null)
  const [remoteBedName, setRemoteBedName] = useState('')
  const [remoteBedText, setRemoteBedText] = useState('')
  const [theme, setTheme] = useState<'light' | 'dark'>(loadTheme)
  const [svgTintConfig, setSvgTintConfig] = useState<SvgTintConfig>(loadSvgTintConfig)
  const [showSvgTintModal, setShowSvgTintModal] = useState(false)
  /** 当前文件夹下各分组的替换图：sectionId -> ReplacementItem[]（可多张） */
  const [replacementsByFolderId, setReplacementsByFolderId] = useState<Record<string, Record<string, import('./types').ReplacementItem[]>>>({})

  const fetchManifest = () => {
    const applyData = (data: unknown) => {
      const next = normalizeManifest(data)
      setManifest(next)
      setError(null)
      if (next.folders.length > 0 && !selectedFolderId) {
        setSelectedFolderId(next.folders[0].id)
      }
      if (selectedFolderId && !next.folders.some((f) => f.id === selectedFolderId)) {
        setSelectedFolderId(next.folders[0]?.id ?? null)
      }
    }

    const tryFetchJson = async (url: string): Promise<unknown | null> => {
      try {
        const r = await fetch(url, { cache: 'no-store' })
        if (!r.ok) return null
        return await r.json()
      } catch {
        return null
      }
    }

    ;(async () => {
      try {
        let data: unknown | null = null
        if (import.meta.env.DEV) {
          data = await tryFetchJson('/assets-manifest.json')
        } else {
          data = await tryFetchJson(new URL('assets-manifest.json', window.location.href).href)
          if (data == null) {
            data = await tryFetchJson(`${import.meta.env.BASE_URL}assets-manifest.json`)
          }
        }
        applyData(data ?? bundledAssetsManifest)
      } catch {
        applyData(bundledAssetsManifest)
      } finally {
        setLoading(false)
      }
    })()
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

  /** 按内置规则（文件名关键词等）自动语义分组 */
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
  /** 勾选后网格与搜索中不展示 json、pdf 等非图片类素材（仍参与保存与分组数据） */
  const [hideNonImageFiles, setHideNonImageFiles] = useState(true)

  const visibleAssets = useMemo(() => {
    if (!hideNonImageFiles) return assets
    return assets.filter(isImageListingAsset)
  }, [assets, hideNonImageFiles])

  const visibleAssetIds = useMemo((): ReadonlySet<string> | null => {
    if (!hideNonImageFiles) return null
    return new Set(visibleAssets.map((a) => a.id))
  }, [hideNonImageFiles, visibleAssets])

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

  /** 搜索模糊匹配结果（随「隐藏非图片」过滤） */
  const searchFilteredAssets = useMemo(() => {
    const q = searchQuery.trim()
    if (!q || !visibleAssets.length) return []
    return visibleAssets.filter((a) => fuzzyMatch(q, a.name) || fuzzyMatch(q, a.path))
  }, [searchQuery, visibleAssets])

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

  useEffect(() => {
    if (!showAddProjectDropdown) return
    const onMouseDown = (e: MouseEvent) => {
      if (addProjectDropdownRef.current?.contains(e.target as Node)) return
      setShowAddProjectDropdown(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [showAddProjectDropdown])

  useEffect(() => {
    if (!hideNonImageFiles) return
    const vis = new Set(visibleAssets.map((a) => a.id))
    setSelectedAssetIds((prev) => {
      const next = new Set([...prev].filter((id) => vis.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [hideNonImageFiles, visibleAssets])

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

  /** 远程图床文件夹：从当前会话列表移除选中素材（仅 live_ 会话，下次保存会更新侧车 JSON） */
  const handleRemoveSelectedRemoteBedAssets = async () => {
    if (!currentFolder || selectedAssetIds.size === 0) return
    if (!folderRemoteBedStyle(currentFolder)) return
    if (!currentFolder.id.startsWith('live_')) {
      alert('内置清单中的素材无法从此处移除。')
      return
    }
    const idSet = new Set(selectedAssetIds)
    const n = idSet.size
    if (!(await blockingConfirm(`从当前列表移除已选 ${n} 个素材？`, '移除素材'))) return

    const folderId = currentFolder.id

    setLiveFolders((prev) =>
      prev.map((f) => {
        if (f.id !== folderId) return f
        return {
          ...f,
          assets: f.assets.filter((a) => {
            if (!idSet.has(a.id)) return true
            if (a.displayUrl?.startsWith('blob:')) URL.revokeObjectURL(a.displayUrl)
            return false
          }),
        }
      })
    )

    setCategoriesByFolderId((prev) => {
      const cfg = prev[folderId]
      if (!cfg?.sections?.length) return prev
      return {
        ...prev,
        [folderId]: {
          mode: cfg.mode,
          sections: cfg.sections.map((s) => ({
            ...s,
            assetIds: s.assetIds.filter((id) => !idSet.has(id)),
          })),
        },
      }
    })

    setSelectedAssetIds(new Set())
    setShowMoveToSectionDropdown(false)
  }

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

  const handleSave = async () => {
    if (!currentFolder) return
    const sections = categoriesByFolderId[currentFolder.id]?.sections ?? displaySections
    const replacements = replacementsByFolderId[currentFolder.id] ?? {}
    const replacementsMap: Record<string, string[]> = {}
    Object.entries(replacements).forEach(([sectionId, items]) => {
      replacementsMap[sectionId] = items.map((i) => i.filename)
    })
    const folderAccess = liveFolderAccessRef.current[currentFolder.id]
    const isUnsavedRemoteBed =
      !folderAccess && folderRemoteBedStyle(currentFolder)

    if (isUnsavedRemoteBed) {
      if (!isTauri()) {
        alert('图床/链接分组需在桌面版（Tauri）中保存：将请你选择本地父目录并新建项目文件夹。')
        return
      }
      const parent = await pickParentDirectoryTauri()
      if (parent == null) return
      try {
        const { rootPath } = await createRemoteAnalysisBundleTauri(
          parent,
          currentFolder.name,
          sections,
          replacements,
          currentFolder.assets
        )
        liveFolderAccessRef.current[currentFolder.id] = { kind: 'tauri', rootPath }
        Object.values(replacements)
          .flat()
          .forEach((item) => {
            if (item.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl)
          })
        const savedConfig = await readFolderConfigFromAccess({ kind: 'tauri', rootPath })
        const itemsBySection = await loadReplacementPreviewsFromAccess(
          { kind: 'tauri', rootPath },
          savedConfig?.replacements ?? {}
        )
        const applied = applySavedSections(currentFolder.assets, savedConfig?.sections ?? sections)
        const alignedReplacements: Record<string, import('./types').ReplacementItem[]> = {}
        for (const sec of applied) {
          alignedReplacements[sec.id] = itemsBySection[sec.id] ?? []
        }
        setReplacementsByFolderId((prev) => ({ ...prev, [currentFolder.id]: alignedReplacements }))
        alert(
          `已创建项目文件夹并保存 Svg_replace/config.json：\n${rootPath}\n\n之后可继续在本分组上传替换图，将写入该目录。`
        )
      } catch (err: any) {
        alert('保存失败: ' + (err?.message || err))
      }
      return
    }

    try {
      await saveFolderConfigToSvgReplace(
        currentFolder.name,
        { sections, replacements: replacementsMap },
        folderAccess,
        currentFolder.assets
      )
      alert('已保存配置到分析文件夹下 Svg_replace 文件夹中。下次打开分析文件夹将自动读取配置。')
    } catch (err: any) {
      alert('保存失败: ' + (err?.message || err))
    }
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

  const openRemoteBedModal = () => {
    setRemoteBedAppendFolderId(null)
    const stamp = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    setRemoteBedName(
      `图床素材_${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}_${pad(stamp.getHours())}${pad(stamp.getMinutes())}`
    )
    setRemoteBedText('')
    setShowRemoteBedModal(true)
  }

  const openAppendRemoteAssetsModal = () => {
    if (!currentFolder || !folderRemoteBedStyle(currentFolder)) return
    setRemoteBedAppendFolderId(currentFolder.id)
    setRemoteBedText('')
    setShowRemoteBedModal(true)
  }

  const closeRemoteBedModal = () => {
    setShowRemoteBedModal(false)
    setRemoteBedAppendFolderId(null)
    setRemoteBedText('')
  }

  const handleConfirmRemoteBed = () => {
    const { urls, droppedDuplicateInInputCount } = extractImageUrlsFromTextDetailed(remoteBedText)
    if (urls.length === 0) {
      alert('未识别到图片直链（支持多行 URL 或含链接的 JSON）。请粘贴以 .png / .jpg / .svg 等结尾的完整地址。')
      return
    }

    const appendId = remoteBedAppendFolderId
    if (appendId) {
      const folder = liveFolders.find((f) => f.id === appendId)
      if (!folder) {
        alert('当前文件夹已不在会话列表中，请关闭后重试。')
        closeRemoteBedModal()
        return
      }
      const existingUrls = new Set(
        folder.assets.map((a) => a.displayUrl).filter((u): u is string => Boolean(u))
      )
      const newAssets = buildRemoteAssetEntriesFromUrls(urls, appendId, existingUrls)
      if (newAssets.length === 0) {
        alert('没有可添加的链接（可能已全部存在于当前文件夹，或与已有链接重复）。')
        return
      }
      setLiveFolders((prev) =>
        prev.map((f) =>
          f.id === appendId ? { ...f, assets: [...f.assets, ...newAssets] } : f
        )
      )
      setCategoriesByFolderId((prev) => {
        const cfg = prev[appendId]
        if (!cfg?.sections?.length) return prev
        const newIds = newAssets.map((a) => a.id)
        const savedIds = new Set(cfg.sections.flatMap((s) => s.assetIds))
        const trulyNew = newIds.filter((id) => !savedIds.has(id))
        if (trulyNew.length === 0) return prev
        const unclassified = cfg.sections.find((s) => s.semanticLabel === '未分类')
        if (unclassified) {
          return {
            ...prev,
            [appendId]: {
              ...cfg,
              sections: cfg.sections.map((s) =>
                s.id === unclassified.id
                  ? { ...s, assetIds: [...s.assetIds, ...trulyNew] }
                  : s
              ),
            },
          }
        }
        return {
          ...prev,
          [appendId]: {
            ...cfg,
            sections: [
              ...cfg.sections,
              {
                id: `sem-未分类-${Date.now()}`,
                format: '',
                semanticLabel: '未分类',
                assetIds: trulyNew,
              },
            ],
          },
        }
      })
      closeRemoteBedModal()
      const skippedExisting = urls.length - newAssets.length
      if (droppedDuplicateInInputCount > 0 || skippedExisting > 0) {
        alert('已去除重复添加素材')
      }
      return
    }

    const name = remoteBedName.trim() || '图床素材'
    const existingNames = allFolders.map((f) => f.name)
    if (existingNames.includes(name)) {
      alert('已存在同名标签，请修改显示名称')
      return
    }
    const folderManifest = buildFolderManifestFromRemoteUrls(urls, name)
    setLiveFolders((prev) => [...prev, folderManifest])
    setSelectedFolderId(folderManifest.id)
    closeRemoteBedModal()
    if (droppedDuplicateInInputCount > 0) {
      alert('已去除重复添加素材')
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
        folder.assets.forEach((a) => {
          if (a.displayUrl?.startsWith('blob:')) URL.revokeObjectURL(a.displayUrl)
        })
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
        folderAccess,
        currentFolder.assets
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
                    {folderRemoteBedStyle(f) ? (
                      <Link size={14} strokeWidth={2} aria-hidden />
                    ) : (
                      <Folder size={14} strokeWidth={2} aria-hidden />
                    )}
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
          <div className="header-add-project-wrap" ref={addProjectDropdownRef}>
            <button
              type="button"
              className="save-btn secondary header-add-project-trigger"
              aria-expanded={showAddProjectDropdown}
              aria-haspopup="menu"
              onClick={() => setShowAddProjectDropdown((v) => !v)}
            >
              <Plus size={16} strokeWidth={2} />
              添加项目
              <ChevronDown size={16} strokeWidth={2} className="header-add-project-chevron" aria-hidden />
            </button>
            {showAddProjectDropdown && (
              <div className="header-add-project-menu" role="menu" aria-label="添加项目">
                <button
                  type="button"
                  className="header-add-project-option"
                  role="menuitem"
                  disabled={addFolderLoading}
                  onClick={() => {
                    setShowAddProjectDropdown(false)
                    void handleOpenAddFolder()
                  }}
                >
                  <FolderOpen size={16} strokeWidth={2} aria-hidden />
                  {addFolderLoading ? '读取中…' : '本地图片文件夹'}
                </button>
                <button
                  type="button"
                  className="header-add-project-option"
                  role="menuitem"
                  onClick={() => {
                    setShowAddProjectDropdown(false)
                    openRemoteBedModal()
                  }}
                >
                  <Link size={16} strokeWidth={2} aria-hidden />
                  网络图床素材
                </button>
              </div>
            )}
          </div>
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

      {showRemoteBedModal && (
        <div className="modal-overlay" onClick={closeRemoteBedModal}>
          <div className="modal remote-bed-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {remoteBedAppendFolderId ? '向当前文件夹添加远程素材' : '从图床 / 链接添加素材'}
            </h3>
            <p className="modal-hint">
              粘贴多条图片直链（每行一条），或粘贴接口返回的 JSON（将自动提取其中的图片 URL）。无法仅凭目录地址枚举文件，需完整 https 链接。
              {remoteBedAppendFolderId ? ' 新素材将并入当前标签页，与已有链接去重。' : ''}
            </p>
            {!remoteBedAppendFolderId && (
              <label className="config-row" style={{ display: 'block', marginBottom: 8 }}>
                <span className="config-label">显示名称</span>
                <input
                  type="text"
                  className="modal-input"
                  style={{ marginBottom: 12 }}
                  value={remoteBedName}
                  onChange={(e) => setRemoteBedName(e.target.value)}
                  placeholder="图床素材"
                  aria-label="图床素材显示名称"
                />
              </label>
            )}
            <textarea
              className="modal-input modal-textarea"
              rows={10}
              value={remoteBedText}
              onChange={(e) => setRemoteBedText(e.target.value)}
              placeholder="https://example.com/path/image.png"
              aria-label="图片 URL 或 JSON"
            />
            <div className="modal-actions">
              <button type="button" className="save-btn secondary" onClick={closeRemoteBedModal}>
                取消
              </button>
              <button type="button" className="save-btn" onClick={handleConfirmRemoteBed}>
                <Link size={14} strokeWidth={2} />
                {remoteBedAppendFolderId ? '添加素材' : '添加预览'}
              </button>
            </div>
          </div>
        </div>
      )}

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
                    {currentFolder && folderRemoteBedStyle(currentFolder) && (
                      <button
                        type="button"
                        className="save-btn secondary small"
                        onClick={openAppendRemoteAssetsModal}
                        title="批量粘贴图片直链，追加到当前图床文件夹"
                      >
                        <ImagePlus size={14} strokeWidth={2} />
                        添加素材
                      </button>
                    )}
                    <button type="button" className="save-btn secondary small" onClick={handleAddManualGroup}>
                      <Plus size={14} strokeWidth={2} />
                      新建分组
                    </button>
                    <button
                      type="button"
                      className="save-btn secondary small"
                      onClick={handleRunAIAnalysis}
                      title="按内置规则（文件名关键词等）自动语义分组"
                    >
                      <Sparkles size={14} strokeWidth={2} />
                      自动语义分组
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
                                            <LeftSearchResultThumb asset={asset} />
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
                  <div className="left-panel-sticky-right">
                    <label className="left-panel-hide-non-image-label">
                      <input
                        type="checkbox"
                        checked={hideNonImageFiles}
                        onChange={(e) => setHideNonImageFiles(e.target.checked)}
                        aria-label="隐藏非图片文件"
                      />
                      <span>隐藏非图片文件</span>
                    </label>
                    <button type="button" className="save-btn small" onClick={handleSave} disabled={!currentFolder}>
                      <Save size={14} strokeWidth={2} />
                      保存到项目
                    </button>
                  </div>
                </div>
              </div>
              <div className="left-panel-body">
                <div className="left-panel-outline-column">
                  <SectionOutline
                    sections={displayOrderSections}
                    onReorder={handleOutlineReorder}
                    onSectionClick={handleOutlineSectionClick}
                  />
                </div>
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
                onSectionReplaceModeChange={handleSectionReplaceModeChange}
                    visibleAssetIds={visibleAssetIds}
                  />
                </div>
              </div>
              {selectedAssetIds.size > 0 && (
                <div className="selection-capsule" role="toolbar" aria-label="选中素材操作">
                  <button
                    type="button"
                    className="selection-capsule-btn"
                    onClick={() => setSelectedAssetIds(new Set())}
                  >
                    取消选中（{selectedAssetIds.size}个）
                  </button>
                  <span className="selection-capsule-divider" aria-hidden />
                  <button
                    type="button"
                    className="selection-capsule-btn"
                    onClick={() => {
                      const assetsById = new Map(currentFolder.assets.map((a) => [a.id, a]))
                      const text = buildSelectedAssetsClipboardText(
                        selectedAssetIds,
                        assetsById,
                        folderRemoteBedStyle(currentFolder)
                      )
                      if (text) void navigator.clipboard.writeText(text)
                    }}
                  >
                    {folderRemoteBedStyle(currentFolder) ? (
                      <Link size={16} strokeWidth={2} aria-hidden />
                    ) : (
                      <Copy size={16} strokeWidth={2} aria-hidden />
                    )}
                    {folderRemoteBedStyle(currentFolder) ? '复制链接' : '复制名称'}
                  </button>
                  <div className="selection-capsule-move-wrap">
                    <button
                      type="button"
                      className="selection-capsule-btn"
                      onClick={() => setShowMoveToSectionDropdown((v) => !v)}
                      aria-expanded={showMoveToSectionDropdown}
                      aria-haspopup="true"
                    >
                      <FolderInput size={16} strokeWidth={2} aria-hidden />
                      移动分组
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
                  {folderRemoteBedStyle(currentFolder) && currentFolder.id.startsWith('live_') && (
                    <button
                      type="button"
                      className="selection-capsule-btn selection-capsule-btn-danger"
                      onClick={() => void handleRemoveSelectedRemoteBedAssets()}
                    >
                      <Trash2 size={16} strokeWidth={2} aria-hidden />
                      移除
                    </button>
                  )}
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
