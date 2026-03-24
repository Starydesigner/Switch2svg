import { useEffect, useState } from 'react'
import type { ReplacementItem } from '../types'
import { SvgImage, isSvgFile } from './SvgImage'
import './ReplacementThumbnail.css'

export function ReplacementThumbnail({ item }: { item: ReplacementItem }) {
  const [imgError, setImgError] = useState(false)
  useEffect(() => {
    if (item.previewUrl) setImgError(false)
  }, [item.previewUrl])

  if (!item.previewUrl || imgError) {
    return (
      <div className="replacement-thumbnail replacement-thumbnail--placeholder" title={item.filename} aria-hidden>
        {isSvgFile(item.filename) ? 'SVG' : '—'}
      </div>
    )
  }

  const svg = item.isSvg || isSvgFile(item.filename)
  return (
    <div className="replacement-thumbnail">
      {svg ? (
        <SvgImage
          src={item.previewUrl}
          alt=""
          className="replacement-thumbnail-img"
          onError={() => setImgError(true)}
        />
      ) : (
        <img
          src={item.previewUrl}
          alt=""
          className="replacement-thumbnail-img"
          onError={() => setImgError(true)}
        />
      )}
    </div>
  )
}
