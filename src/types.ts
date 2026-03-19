export type Platform = 'ios' | 'android'

export interface AssetImage {
  scale?: string
  filename: string
}

export interface AssetEntry {
  id: string
  name: string
  path: string
  format: string
  images: AssetImage[]
  /** 由 FSA 实时读取时生成的展示用 URL，优先于 path 用于预览 */
  displayUrl?: string
  /** 文件大小（字节），由 FSA 读取时填充 */
  size?: number
}

export interface FolderManifest {
  id: string
  name: string
  assets: AssetEntry[]
}

/** 清单：按文件夹 */
export interface FoldersManifest {
  folders: FolderManifest[]
}

/** 旧版清单（向后兼容读取） */
export interface AssetsManifest {
  ios: AssetEntry[]
  android: AssetEntry[]
}

/** 分析文件夹列表配置 */
export interface AnalysisFoldersConfig {
  folderNames: string[]
}

/** 分组下已上传的替换素材（可多张） */
export interface ReplacementItem {
  id: string
  filename: string
  previewUrl?: string
  width?: number
  height?: number
  /** 文件大小（字节），由 FSA 读取时填充 */
  size?: number
}

/** 持久化：按场景、格式、语义分组的分类结果（旧） */
export interface CategoryGroup {
  semanticLabel: string
  assetIds: string[]
}

export interface PlatformCategories {
  byFormat: Record<string, string[]>
  bySemantic: CategoryGroup[]
}

export interface CategoriesData {
  ios?: PlatformCategories
  android?: PlatformCategories
  version?: number
}
