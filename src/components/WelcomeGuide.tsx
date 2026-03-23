import { FolderOpen, Layers, ArrowRight, Palette, Link2 } from 'lucide-react'
import './WelcomeGuide.css'

interface WelcomeGuideProps {
  onPickFolder: () => void
  picking?: boolean
}

export function WelcomeGuide({ onPickFolder, picking }: WelcomeGuideProps) {
  return (
    <div className="welcome-guide">
      <div className="welcome-guide__intro">
        <h2 className="welcome-guide__title">欢迎使用</h2>
        <p className="welcome-guide__lead">
          浏览、分组与替换工程里的图标与图片；支持<strong>本地文件夹</strong>与<strong>图床直链</strong>，配置可写回项目。
        </p>
        <button
          type="button"
          className="welcome-guide__cta save-btn"
          onClick={onPickFolder}
          disabled={picking}
        >
          <FolderOpen size={18} strokeWidth={2} />
          {picking ? '读取中…' : '选择文件夹开始'}
        </button>
      </div>

      <div className="welcome-guide__grid">
        <section className="welcome-card" aria-labelledby="welcome-block-1">
          <div className="welcome-card__viz welcome-card__viz--capsule" aria-hidden>
            <div className="welcome-viz-stack">
              <span className="welcome-viz-tile welcome-viz-tile--a" />
              <span className="welcome-viz-tile welcome-viz-tile--b" />
              <span className="welcome-viz-tile welcome-viz-tile--c" />
            </div>
            <div className="welcome-viz-arrow" />
            <div className="welcome-viz-folder">
              <Layers size={22} strokeWidth={2} />
            </div>
            <span className="welcome-viz-link-badge" aria-hidden>
              <Link2 size={18} strokeWidth={2} />
            </span>
          </div>
          <h3 id="welcome-block-1" className="welcome-card__heading">
            工具能做什么
          </h3>
          <ul className="welcome-card__list">
            <li>
              <strong>本地</strong>：选文件夹，递归展示图片 / SVG / Lottie 等，卡片里可拖拽分组。
            </li>
            <li>
              <strong>图床</strong>：「添加项目」里粘贴直链（多行或 JSON），分组、预览与本地一致；标签为链式图标。
            </li>
            <li>
              替换图与配置进 <code>Svg_replace/</code>；图床列表进根目录 <code>switch2svg-remote-assets.json</code>，重开自动恢复。
            </li>
          </ul>
        </section>

        <section className="welcome-card" aria-labelledby="welcome-block-2">
          <div className="welcome-card__viz welcome-card__viz--flow" aria-hidden>
            <div className="welcome-step">
              <span className="welcome-step__num">1</span>
              <span className="welcome-step__label">选目录</span>
            </div>
            <ArrowRight className="welcome-step__arrow" size={18} strokeWidth={2} />
            <div className="welcome-step">
              <span className="welcome-step__num">2</span>
              <span className="welcome-step__label">分组 / 替换</span>
            </div>
            <ArrowRight className="welcome-step__arrow" size={18} strokeWidth={2} />
            <div className="welcome-step">
              <span className="welcome-step__num">3</span>
              <span className="welcome-step__label">保存</span>
            </div>
          </div>
          <h3 id="welcome-block-2" className="welcome-card__heading">
            推荐使用方式
          </h3>
          <ol className="welcome-card__list welcome-card__list--ordered">
            <li>
              <strong>本地</strong>：点「选择文件夹」打开资源目录；<strong>图床</strong>：「添加项目」→ 粘贴链接（首次保存需<strong>桌面版</strong>选父目录）。
            </li>
            <li>左侧调分组，右侧整理卡片；可上传替换图或用「自动语义分组」。</li>
            <li>保存后下次再选同一文件夹，分组与图床列表会自动载入。</li>
          </ol>
        </section>

        <section className="welcome-card" aria-labelledby="welcome-block-3">
          <div className="welcome-card__viz welcome-card__viz--tint" aria-hidden>
            <div className="welcome-viz-fake-svg">
              <span className="welcome-viz-fake-svg__shape" />
            </div>
            <ArrowRight className="welcome-viz-tint-flow__arrow" size={18} strokeWidth={2} />
            <div className="welcome-viz-fake-svg welcome-viz-fake-svg--tinted">
              <span className="welcome-viz-fake-svg__shape" />
            </div>
            <Palette className="welcome-viz-tint-palette" size={22} strokeWidth={2} />
          </div>
          <h3 id="welcome-block-3" className="welcome-card__heading">
            SVG 预览改色
          </h3>
          <ul className="welcome-card__list">
            <li>
              单色<strong>线稿 SVG</strong>预览可统一改 fill / stroke；顶栏 <strong>SVG 改色</strong> 里可选随主题或自定义色，设置会记住。
            </li>
            <li>多色、渐变等复杂 SVG 会自动跳过改色，避免破坏原稿。</li>
          </ul>
        </section>
      </div>
    </div>
  )
}
