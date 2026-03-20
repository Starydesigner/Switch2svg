import { FileType2 } from 'lucide-react'

/** 无法浏览器内预览的素材统一使用此占位（与卡片缩略区尺寸协调） */
export function AssetThumbPlaceholder({
  title = '无法预览此格式',
  large,
}: {
  title?: string
  /** 全屏预览等场景使用更大图标 */
  large?: boolean
}) {
  return (
    <span
      className={`asset-thumb-placeholder-icon${large ? ' asset-thumb-placeholder-icon--large' : ''}`}
      title={title}
      aria-hidden
    >
      <FileType2 size={large ? 56 : 26} strokeWidth={large ? 1.5 : 1.75} />
    </span>
  )
}
