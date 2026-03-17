/**
 * 按命名语义规则分类：关键词 -> 显示标签
 * 优先级：先匹配的先生效（可把更具体的放前面）
 */
const SEMANTIC_KEYWORDS: [string[], string][] = [
  [['arrow', '箭头', 'jiantou', 'back', '返回', 'right', 'left', 'up', 'down'], '返回/箭头'],
  [['close', '关闭', 'cancel'], '关闭'],
  [['icon', 'ic_'], '图标'],
  [['home', 'nav', '导航'], '导航/首页'],
  [['star', 'level', '等级'], '等级/星星'],
  [['my_center', 'mycenter', 'center'], '我的中心'],
  [['search', 'sarch'], '搜索'],
  [['setting', 'settings'], '设置'],
  [['avatar', 'user', 'head'], '用户/头像'],
  [['message', 'msg', 'sms'], '消息'],
  [['call', 'phone'], '电话'],
  [['share'], '分享'],
  [['add', 'reduce', 'qs_'], '加减/操作'],
  [['map', 'location'], '地图/定位'],
  [['camera', 'flash', 'light'], '相机/闪光灯'],
  [['login', 'logo'], '登录/Logo'],
  [['ludan', 'order'], '录单/订单'],
  [['customer', 'tips'], '客户/提示'],
  [['hud', 'success', 'fail'], 'HUD/状态'],
  [['asset', 'play', 'arrow'], '资产/播放'],
  [['sign', 'signS'], '签收'],
  [['urge', 'pay', 'guide'], '催付/引导'],
  [['mark', 'package', 'hand'], '标记/包裹'],
  [['weather', 'clearday', 'snow', 'rain', 'hail', 'thunder'], '天气'],
  [['filter', 'triangle'], '筛选/三角'],
  [['scan', 'saoyisao', 'nav_scan'], '扫码'],
  [['anydoor', 'quick_operation'], '任意门/快捷操作'],
  [['ping', 'at', 'im'], 'IM/@'],
  [['hms', 'live', 'window'], 'HMS/悬浮窗'],
  [['examin', 'upload'], '审核/上传'],
  [['tag', 'pop', 'user_tag'], '标签/弹窗'],
]

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[-_\s]+/g, '_')
}

/**
 * 根据资源 name 返回语义标签
 */
export function getSemanticLabel(name: string): string {
  const n = normalizeName(name)
  for (const [keywords, label] of SEMANTIC_KEYWORDS) {
    if (keywords.some((k) => n.includes(k.toLowerCase()))) return label
  }
  return '未分类'
}
