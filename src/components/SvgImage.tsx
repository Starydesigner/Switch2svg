import type { ImgHTMLAttributes } from 'react'
import SVGInject from '@iconfu/svg-inject'
import { svgShouldSkipTint } from '../utils/svgMulticolor'
import './SvgImage.css'

/**
 * 渲染 SVG 图标：onload 时用 SVGInject 内联 SVG，改色通过 CSS 变量 --svg-tint-color 作用到 fill/stroke。
 * 多色 / 渐变 / CSS 变量 等（svgShouldSkipTint）不应用改色，保留原稿颜色。
 */
export function SvgImage({
  src,
  alt = '',
  className,
  onLoad,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const wrap = img.parentElement
    wrap?.classList.remove('svg-no-tint')
    let skipTint = false
    try {
      SVGInject(img, {
        beforeInject: (_i, svg) => {
          skipTint = svgShouldSkipTint(svg as SVGSVGElement)
        },
        afterInject: (_i, svg) => {
          const container = svg.parentElement
          if (container?.classList.contains('svg-tint-container') && skipTint) {
            container.classList.add('svg-no-tint')
          }
        },
      })
    } catch (_) {
      /* 注入失败时保留 img 显示 */
    }
    onLoad?.(e)
  }

  return (
    <span className="svg-tint-container">
      <img
        src={src}
        alt={alt}
        className={className}
        onLoad={handleLoad}
        {...props}
      />
    </span>
  )
}

/** 根据文件名或 format 判断是否为 SVG */
export function isSvgFile(filenameOrPath: string, format?: string): boolean {
  if ((format || '').toLowerCase() === 'svg') return true
  return (filenameOrPath || '').toLowerCase().endsWith('.svg')
}
