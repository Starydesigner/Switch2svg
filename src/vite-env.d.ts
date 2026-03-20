/// <reference types="vite/client" />

declare module '@iconfu/svg-inject' {
  const SVGInject: (img: HTMLImageElement, options?: Record<string, unknown>) => void
  export default SVGInject
}
