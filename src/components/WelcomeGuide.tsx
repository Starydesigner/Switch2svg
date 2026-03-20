import { FolderOpen, Layers, ArrowRight, Palette } from 'lucide-react'
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
          集中查看、分组与替换 App 工程中的图标与图片资源，并生成可复用的替换配置。
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
          </div>
          <h3 id="welcome-block-1" className="welcome-card__heading">
            工具能做什么
          </h3>
          <ul className="welcome-card__list">
            <li>递归浏览所选目录下的图片、SVG 等资源，按分组卡片展示。</li>
            <li>为分组配置替换图或删除/保留策略，估算包体变化。</li>
            <li>将分组与映射保存到目录内 <code>Svg_replace/config.json</code>，便于版本协作。</li>
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
            <li>点击上方或本页的「选择文件夹」，选中包含素材的分析目录（如某平台 res 根目录）。</li>
            <li>在左侧大纲与右侧卡片中调整分组；需要时上传替换图或使用「自动语义分组」。</li>
            <li>使用「保存到项目」或自动保存，将结果写入 <code>Svg_replace</code>；下次再选同一目录会自动载入配置。</li>
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
              载入资源后，适合单色化的 <strong>线稿类 SVG</strong> 预览会按全局色号统一渲染 fill / stroke，方便在明暗背景下核对观感。
            </li>
            <li>
              点击顶栏的 <strong>SVG 改色</strong>（色块 + 文案）：可开启「随主题适配」（亮/暗各一套默认色），或关闭后输入自定义十六进制颜色；设置会保存到本地。
            </li>
            <li>
              <strong>多色、渐变、图案填充或含 CSS 变量</strong> 的 SVG 会自动跳过改色，保持文件原有配色，避免破坏设计。
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
