import { useState, useEffect, useMemo, useRef } from 'react'
import type { FoldersManifest } from './types'
import {
  buildFormatOnlySections,
  buildDefaultSections,
  applySavedSections,
  type CategorySection,
  type FolderCategoryConfig,
} from './utils/categories'
import { AssetGrid } from './components/AssetGrid'
import {
  pickAnalysisFolderDirect,
  readFolderContentFromHandle,
  readFolderConfigFromHandle,
  loadReplacementPreviewsFromHandle,
  saveFolderConfigToSvgReplace,
  removeFolderFromAnalysisConfig,
} from './utils/fsa'
import './App.css'

const AI_CONFIG_KEY = 'switch2svg-ai-config'

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
  /** 当前会话中直接选择的文件夹 handle，用于保存/上传时不再弹窗 */
  const liveFolderHandlesRef = useRef<Record<string, FileSystemDirectoryHandle>>({})
  /** 已从列表中移除的 manifest 文件夹名称（已从 analysis-folders 配置中删除，需过滤展示） */
  const [removedFolderNames, setRemovedFolderNames] = useState<Set<string>>(new Set())
  const [addFolderLoading, setAddFolderLoading] = useState(false)
  const [showAIConfig, setShowAIConfig] = useState(false)
  const [aiConfig, setAIConfig] = useState<AIConfig>(loadAIConfig)
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
  const handleRunAIAnalysis = () => {
    if (!currentFolder) return
    setFolderConfig({ mode: 'auto', sections: buildDefaultSections(assets) })
  }

  const [newSectionIdToFocus, setNewSectionIdToFocus] = useState<string | null>(null)

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

  const handleSectionDelete = (sectionId: string) => {
    if (!currentFolder) return
    const sourceSections = categoriesByFolderId[currentFolder.id]?.sections ?? displaySections
    const target = sourceSections.find((s) => s.id === sectionId)
    if (!target) return
    if (!confirm(`确定删除分组「${target.semanticLabel || '未分类'}」吗？`)) return

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
    const folderHandle = liveFolderHandlesRef.current[currentFolder.id]
    saveFolderConfigToSvgReplace(currentFolder.name, { sections, replacements: replacementsMap }, folderHandle)
      .then(() => alert('已保存到 ' + currentFolder.name + '/Svg_replace/config.json'))
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
    setReplacementsByFolderId((prev) => {
      const next = { ...prev, [currentFolder!.id]: { ...(prev[currentFolder!.id] ?? {}) } }
      const list = (next[currentFolder!.id][sectionId] ?? []).filter((i) => i.id !== itemId)
      if (list.length) next[currentFolder!.id][sectionId] = list
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
      const { folderHandle, folderName } = await pickAnalysisFolderDirect()
      if (existingNames.includes(folderName)) {
        alert('该文件夹已在列表中')
        return
      }
      const folderId = `live_${folderName.replace(/\W/g, '_')}_${Date.now()}`
      const folderManifest = await readFolderContentFromHandle(folderHandle, folderName, folderId)
      liveFolderHandlesRef.current[folderId] = folderHandle
      setLiveFolders((prev) => [...prev, folderManifest])
      setSelectedFolderId(folderId)

      const savedConfig = await readFolderConfigFromHandle(folderHandle)
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
        const itemsBySection = await loadReplacementPreviewsFromHandle(folderHandle, savedConfig.replacements)
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

  const handleDeleteFolder = (folderId: string, folderName: string, isLive: boolean) => {
    if (!confirm(`确定要移除「${folderName}」吗？`)) return
    if (selectedFolderId === folderId) {
      const rest = allFolders.filter((f) => f.id !== folderId)
      setSelectedFolderId(rest[0]?.id ?? null)
    }
    if (isLive) {
      const folder = liveFolders.find((f) => f.id === folderId)
      if (folder) {
        folder.assets.forEach((a) => { if (a.displayUrl) URL.revokeObjectURL(a.displayUrl) })
        setLiveFolders((prev) => prev.filter((f) => f.id !== folderId))
        delete liveFolderHandlesRef.current[folderId]
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
    const folderHandle = liveFolderHandlesRef.current[currentFolder.id]
    if (!folderHandle) return

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
        folderHandle
      ).catch((err) => {
        console.error('Auto save config failed:', err)
      })
    }, 500)

    return () => window.clearTimeout(timer)
  }, [currentFolder, categoriesByFolderId, displaySections, replacementsByFolderId])

  return (
    <div className="app">
      <header className="header">
        <h1 className="title">Switch2svg</h1>
        <div className="header-tabs-row">
          <nav className="tabs">
            {allFolders.map((f) => {
              const isLive = f.id.startsWith('live_')
              return (
                <span key={f.id} className="tab-wrap">
                  <button
                    type="button"
                    className={`tab ${selectedFolderId === f.id ? 'active' : ''}`}
                    onClick={() => setSelectedFolderId(f.id)}
                  >
                    {f.name}
                  </button>
                  <button
                    type="button"
                    className="tab-remove"
                    onClick={(e) => { e.stopPropagation(); handleDeleteFolder(f.id, f.name, isLive); }}
                    title="移除该文件夹"
                    aria-label="移除"
                  >
                    ×
                  </button>
                </span>
              )
            })}
          </nav>
          <button type="button" className="save-btn secondary" onClick={handleOpenAddFolder} disabled={addFolderLoading}>
            {addFolderLoading ? '读取中…' : '选择文件夹'}
          </button>
        </div>
      </header>

      {showAIConfig && (
        <div className="modal-overlay" onClick={() => setShowAIConfig(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>阿里千问 API 配置</h3>
            <p className="modal-hint">用于「AI 分析」时的语义分组。不填写则使用内置规则（按文件名关键词）分组，无需 API。</p>
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
              <button type="button" className="save-btn" onClick={saveAIConfig}>保存</button>
            </div>
          </div>
        </div>
      )}

      <main className="main">
        {loading && <p className="status">加载资源清单中…</p>}
        {error && <p className="status error">{error}</p>}
        {!loading && !error && allFolders.length === 0 && (
          <p className="status">请点击「选择文件夹」添加分析文件夹，即可实时查看该目录下所有层级的资源。</p>
        )}
        {!loading && !error && currentFolder && (
          <div className="content">
            <section className="left-panel">
              <div className="panel-title-row">
                <h2 className="panel-title">图标资源</h2>
                <div className="panel-title-actions">
                  <button type="button" className="save-btn secondary small" onClick={handleRunAIAnalysis} title="按规则或千问大模型对资源做语义分组">
                    AI 分析
                  </button>
                  <button type="button" className="save-btn secondary small" onClick={() => setShowAIConfig(true)}>
                    AI 配置
                  </button>
                  <button type="button" className="save-btn small" onClick={handleSave} disabled={!currentFolder}>
                    保存到项目
                  </button>
                </div>
              </div>
              <AssetGrid
                assets={assets}
                sections={displaySections}
                onSectionsChange={handleSectionsChange}
                folderName={currentFolder.name}
                folderHandle={liveFolderHandlesRef.current[currentFolder.id]}
                replacements={replacementsByFolderId[currentFolder.id] ?? {}}
                onReplacementUploaded={handleReplacementUploaded}
                onReplacementDelete={handleReplacementDelete}
                onReplacementMove={handleReplacementMove}
                onAddManualGroup={handleAddManualGroup}
                onSectionRename={handleSectionRename}
                onSectionDelete={handleSectionDelete}
                newSectionIdToFocus={newSectionIdToFocus}
                onClearNewSectionIdToFocus={() => setNewSectionIdToFocus(null)}
              />
            </section>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
