import { isTauri } from '@tauri-apps/api/core'

/**
 * 阻塞式二次确认。Tauri/WKWebView 下 window.confirm 的返回值不可靠，改用原生对话框。
 */
export async function blockingConfirm(message: string, title = '请确认'): Promise<boolean> {
  if (isTauri()) {
    const { confirm } = await import('@tauri-apps/plugin-dialog')
    return confirm(message, {
      title,
      okLabel: '确定',
      cancelLabel: '取消',
      kind: 'warning',
    })
  }
  return window.confirm(message)
}
