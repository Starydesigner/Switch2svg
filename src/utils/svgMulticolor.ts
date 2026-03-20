/**
 * 在注入到页面前检测 SVG 是否「多色」或含渐变/变量等不宜强行单色化的绘制。
 * 保守策略：多色 / url() / var() → 不应用全局 --svg-tint-color。
 */

const SHAPE_TAGS = new Set([
  'path',
  'circle',
  'rect',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'use',
])

function parseStylePaint(style: string, prop: 'fill' | 'stroke'): string | null {
  if (!style) return null
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;!]+)`, 'i')
  const m = style.match(re)
  return m ? m[1].trim() : null
}

/** 读取元素上的 fill/stroke：属性优先，否则 style，再否则继承值 */
function readPaint(el: Element, prop: 'fill' | 'stroke', inherited: string): string {
  const attr = el.getAttribute(prop)
  if (attr != null && attr !== '') {
    const t = attr.trim()
    if (t.toLowerCase() !== 'inherit') return t
  }
  const fromStyle = parseStylePaint(el.getAttribute('style') || '', prop)
  if (fromStyle && fromStyle.toLowerCase() !== 'inherit') return fromStyle
  return inherited
}

function initialPaintOnSvgRoot(svg: SVGSVGElement, prop: 'fill' | 'stroke'): string {
  const defF = '#000000'
  const defS = 'none'
  if (prop === 'fill') {
    const a = svg.getAttribute('fill')
    if (a != null && a !== '') {
      const t = a.trim()
      if (t.toLowerCase() !== 'inherit') return t
    }
    const st = parseStylePaint(svg.getAttribute('style') || '', 'fill')
    if (st && st.toLowerCase() !== 'inherit') return st
    return defF
  }
  const a = svg.getAttribute('stroke')
  if (a != null && a !== '') {
    const t = a.trim()
    if (t.toLowerCase() !== 'inherit') return t
  }
  const st = parseStylePaint(svg.getAttribute('style') || '', 'stroke')
  if (st && st.toLowerCase() !== 'inherit') return st
  return defS
}

/** 常见命名色（导出 SVG 里偶发出现；用于区分多色） */
const NAMED_COLORS: Record<string, string> = {
  white: '#ffffff',
  black: '#000000',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  gray: '#808080',
  grey: '#808080',
  orange: '#ffa500',
  yellow: '#ffff00',
  purple: '#800080',
  lime: '#00ff00',
  aqua: '#00ffff',
  cyan: '#00ffff',
  teal: '#008080',
  navy: '#000080',
  maroon: '#800000',
  silver: '#c0c0c0',
}

function normalizeSolidColor(raw: string): string | null {
  const t = raw.trim().toLowerCase()
  if (!t || t === 'none' || t === 'transparent') return null
  if (t === 'currentcolor') return null

  if (NAMED_COLORS[t]) return NAMED_COLORS[t]

  if (t.startsWith('#')) {
    let h = t.slice(1)
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
    }
    if (h.length === 6 && /^[0-9a-f]+$/i.test(h)) return `#${h.toLowerCase()}`
    if (h.length === 8 && /^[0-9a-f]+$/i.test(h)) {
      const alpha = h.slice(6, 8)
      if (alpha === '00') return null
      return `#${h.slice(0, 6).toLowerCase()}`
    }
    return null
  }

  const rgb = t.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/)
  if (rgb) {
    const a = rgb[4] !== undefined ? parseFloat(rgb[4]) : 1
    if (a === 0) return null
    const r = Math.round(parseFloat(rgb[1]))
    const g = Math.round(parseFloat(rgb[2]))
    const b = Math.round(parseFloat(rgb[3]))
    const toHex = (n: number) => n.toString(16).padStart(2, '0')
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
  }

  return null
}

function classifyPaint(value: string): 'skip' | 'non-solid' | 'solid' {
  const t = value.trim()
  if (!t || t.toLowerCase() === 'none' || t.toLowerCase() === 'transparent') return 'skip'
  if (t.toLowerCase() === 'currentcolor') return 'skip'
  if (/url\(/i.test(t) || /var\(/i.test(t)) return 'non-solid'
  const n = normalizeSolidColor(t)
  if (n) return 'solid'
  return 'skip'
}

type WalkAcc = { colors: Set<string>; nonSolid: boolean }

function walk(el: Element, inhFill: string, inhStroke: string, acc: WalkAcc): void {
  if (acc.nonSolid) return

  const tag = el.tagName.toLowerCase()
  /* 不解析 defs/style 等，避免误读渐变定义里的颜色 */
  if (tag === 'defs' || tag === 'style' || tag === 'script' || tag === 'title' || tag === 'desc') {
    return
  }

  const fill = readPaint(el, 'fill', inhFill)
  const stroke = readPaint(el, 'stroke', inhStroke)
  if (SHAPE_TAGS.has(tag)) {
    for (const p of [fill, stroke]) {
      const c = classifyPaint(p)
      if (c === 'non-solid') {
        acc.nonSolid = true
        return
      }
      if (c === 'solid') acc.colors.add(normalizeSolidColor(p)!)
    }
  }

  const childFill = fill
  const childStroke = stroke

  for (const child of el.children) {
    walk(child, childFill, childStroke, acc)
  }
}

/**
 * 从「尚未挂上页面改色样式」的 SVG 根节点解析：是否应跳过单色 tint。
 */
export function svgShouldSkipTint(svg: SVGSVGElement): boolean {
  const inhF = initialPaintOnSvgRoot(svg, 'fill')
  const inhS = initialPaintOnSvgRoot(svg, 'stroke')
  const acc: WalkAcc = { colors: new Set(), nonSolid: false }

  for (const child of svg.children) {
    walk(child, inhF, inhS, acc)
  }

  if (acc.nonSolid) return true
  return acc.colors.size > 1
}
