import './NamingRuleBullets.css'

/** 批量 / 单张替换图重命名共用，最多 3 条 */
export function NamingRuleBullets() {
  return (
    <ul className="naming-rule-bullets">
      <li>
        文件名由<strong>前缀</strong>、<strong>名称</strong>、<strong>后缀</strong>与<strong>扩展名</strong>组成，保存时为下划线连接的三段加扩展名。
      </li>
      <li>
        <code>ic</code> / <code>img</code> / <code>bg</code>：图标、插图或大图、背景与开屏；<code>line</code> / <code>filled</code>：线性描边、面性（默认 <code>line</code>）。名称栏只写语义，中文转拼音（本地词库）。
      </li>
      <li>
        「全部智能填充」或「智能填充」仅根据<strong>该替换图当前文件名</strong>推断；中文文件名用本地词库转<strong>拼音</strong>再蛇形拼接，无在线翻译。
      </li>
    </ul>
  )
}
