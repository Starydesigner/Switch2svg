import { useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import type { ReplacementItem } from '../types'
import { saveReplacementFile, type LiveFolderAccess } from '../utils/fsa'
import './UploadReplacement.css'

function getImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/') && file.type !== 'image/svg+xml') return Promise.resolve(null)
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

interface UploadReplacementProps {
  folderName: string
  folderAccess?: LiveFolderAccess
  sectionId: string
  sectionLabel: string
  onUploaded: (item: ReplacementItem) => void
  disabled?: boolean
}

export function UploadReplacement({
  folderName,
  folderAccess,
  sectionLabel,
  onUploaded,
  disabled,
}: UploadReplacementProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (disabled) return
    if (!folderAccess) {
      alert('无法上传：当前文件夹未通过「选择文件夹」添加，没有写入权限。请先点击顶部「选择文件夹」选中该目录后再上传。')
      return
    }
    inputRef.current?.click()
  }

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    // 注意：某些浏览器里 FileList 是 live 对象，先拷贝再清空 input，避免后续 files 被清空导致“无反应”
    const selectedFiles = Array.from(files)
    e.target.value = ''
    if (!folderAccess) {
      alert('无法上传：当前文件夹没有写入权限，请先通过「选择文件夹」添加该目录。')
      return
    }
    setUploading(true)
    const prefix = sectionLabel ? sectionLabel.replace(/[/\s]+/g, '_') + '_' : ''
    const base = Date.now()
    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i]
        const isImageType = file.type === 'image/svg+xml' || file.type.startsWith('image/') ||
          /\.(svg|png|jpe?g|gif|webp)$/i.test(file.name)
        const previewUrl = isImageType ? URL.createObjectURL(file) : undefined
        try {
          const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : ''
          const nameWithoutExt = file.name.slice(0, file.name.length - ext.length)
          const preferredName = selectedFiles.length > 1
            ? `${prefix}${nameWithoutExt}_${base}_${i}${ext}`
            : `${prefix}${file.name}`
          const filename = await saveReplacementFile(folderName, file, preferredName, folderAccess)
          const dimensions = await getImageDimensions(file)
          const item: ReplacementItem = {
            id: `rep_${base}_${i}`,
            filename,
            isSvg: file.type === 'image/svg+xml' || /\.svg$/i.test(file.name),
            previewUrl,
            width: dimensions?.width,
            height: dimensions?.height,
            size: file.size,
          }
          onUploaded(item)
        } catch (err: any) {
          if (previewUrl) URL.revokeObjectURL(previewUrl)
          const msg = err?.message || String(err)
          console.error('Upload replacement failed:', err)
          alert('上传失败: ' + msg)
        }
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.svg"
        multiple
        className="upload-replacement-input"
        onChange={handleChange}
        disabled={disabled}
      />
      <button
        type="button"
        className="upload-replacement-box"
        onClick={handleClick}
        disabled={disabled || uploading}
        title="上传替换图到本文件夹下的 Svg_replace（可多选）"
      >
        <Plus size={24} strokeWidth={2} />
        <span className="upload-replacement-label">{uploading ? '上传中…' : '上传'}</span>
      </button>
    </>
  )
}
