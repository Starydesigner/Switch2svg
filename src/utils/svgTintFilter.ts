/**
 * 将 hex 颜色转为用于 img 的 CSS filter，使黑色图标显示为目标颜色。
 * 灰阶用 brightness(0) + invert；彩色用 HSL 换算 + sepia 基色校正，使色相/饱和度更接近目标。
 */
export function hexToCssFilter(hex: string): string {
  const raw = hex.replace(/^#/, '').trim()
  if (raw.length !== 6 && raw.length !== 3) return 'none'
  let r: number, g: number, b: number
  if (raw.length === 6) {
    r = parseInt(raw.slice(0, 2), 16) / 255
    g = parseInt(raw.slice(2, 4), 16) / 255
    b = parseInt(raw.slice(4, 6), 16) / 255
  } else {
    r = parseInt(raw[0] + raw[0], 16) / 255
    g = parseInt(raw[1] + raw[1], 16) / 255
    b = parseInt(raw[2] + raw[2], 16) / 255
  }
  if ([r, g, b].some((v) => Number.isNaN(v))) return 'none'

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) {
    if (l >= 1) return 'brightness(0) invert(1)'
    if (l <= 0) return 'brightness(0)'
    const inv = Math.round(l * 100)
    return `brightness(0) saturate(100%) invert(${inv}%)`
  }

  // 彩色：转 HSL，用 sepia 基色 (~34°) + hue-rotate / saturate 逼近目标
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  const hDeg = h * 360

  const SEPIA_BASE_HUE = 34
  const invert = Math.max(0, Math.min(100, Math.round(l * 100)))
  const hueRotate = Math.round(((hDeg - SEPIA_BASE_HUE) % 360 + 360) % 360)
  const saturate = Math.max(100, Math.min(1000, Math.round(100 + s * 500)))

  return `brightness(0) saturate(100%) invert(${invert}%) sepia(100%) hue-rotate(${hueRotate}deg) saturate(${saturate}%)`
}
