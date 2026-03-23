import { useEffect, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import type { AssetEntry } from '../types'
import { getAssetImageUrl } from './assetUrl'

/** 缓存条数上限；超出时按插入顺序淘汰并 revokeObjectURL */
const MAX_CACHE_ENTRIES = 80
/** 单张图最大体积（字节），防止内存与 IPC 压力 */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024

const blobByHttpUrl = new Map<string, string>()
const inflight = new Map<string, Promise<string>>()

function evictOldestBlob() {
  if (blobByHttpUrl.size < MAX_CACHE_ENTRIES) return
  const k = blobByHttpUrl.keys().next().value as string | undefined
  if (k == null) return
  const u = blobByHttpUrl.get(k)
  if (u?.startsWith('blob:')) URL.revokeObjectURL(u)
  blobByHttpUrl.delete(k)
}

/**
 * 在 Tauri 内通过 Rust 侧 HTTP 客户端拉取 **http://** 图片并转为 blob: URL，
 * 避免 https://tauri.localhost 页面下的混合内容拦截。
 */
export async function fetchHttpImageAsBlobUrl(httpUrl: string): Promise<string> {
  const key = httpUrl.trim()
  const hit = blobByHttpUrl.get(key)
  if (hit) return hit

  let p = inflight.get(key)
  if (!p) {
    p = (async () => {
      const { fetch } = await import('@tauri-apps/plugin-http')
      const res = await fetch(key, { method: 'GET', connectTimeout: 45_000 })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buf = await res.arrayBuffer()
      if (buf.byteLength > MAX_IMAGE_BYTES) throw new Error('图片过大')
      const ct =
        res.headers.get('content-type')?.split(';')[0]?.trim() || 'application/octet-stream'
      const blob = new Blob([buf], { type: ct })
      const objectUrl = URL.createObjectURL(blob)
      evictOldestBlob()
      blobByHttpUrl.set(key, objectUrl)
      return objectUrl
    })().finally(() => {
      inflight.delete(key)
    })
    inflight.set(key, p)
  }
  return p
}

export function needsTauriHttpProxy(displayUrl: string | undefined): boolean {
  const u = displayUrl?.trim() ?? ''
  if (!u || u.startsWith('blob:') || u.startsWith('data:')) return false
  if (typeof window === 'undefined') return false
  return isTauri() && /^http:\/\//i.test(u)
}

export function useRemotePreviewSrc(asset: AssetEntry): {
  src: string
  pending: boolean
  failed: boolean
} {
  const resolved = getAssetImageUrl(asset)
  const orig = asset.displayUrl?.trim()
  const proxy = needsTauriHttpProxy(orig)

  const [blobSrc, setBlobSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [pending, setPending] = useState(proxy)

  useEffect(() => {
    if (!proxy || !orig) {
      setBlobSrc(null)
      setFailed(false)
      setPending(false)
      return
    }
    setPending(true)
    setFailed(false)
    setBlobSrc(null)
    let cancelled = false
    fetchHttpImageAsBlobUrl(orig)
      .then((u) => {
        if (cancelled) return
        setBlobSrc(u)
        setPending(false)
      })
      .catch(() => {
        if (cancelled) return
        setFailed(true)
        setPending(false)
      })
    return () => {
      cancelled = true
    }
  }, [proxy, orig])

  if (proxy) {
    if (pending) return { src: '', pending: true, failed: false }
    if (failed) return { src: '', pending: false, failed: true }
    if (blobSrc) return { src: blobSrc, pending: false, failed: false }
    return { src: '', pending: false, failed: true }
  }

  return { src: resolved, pending: false, failed: false }
}
