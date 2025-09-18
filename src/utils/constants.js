// 应用常量配置
module.exports = {
  // 浏览器路径配置
  BROWSER_PATHS: {
    edge: [
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe'
    ],
    chrome: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
    ]
  },

  // Puppeteer启动参数
  BROWSER_ARGS: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--disable-features=TranslateUI',
    '--disable-ipc-flooding-protection',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-web-security',
    '--lang=en-US'
  ],

  // 超时配置
  TIMEOUTS: {
    BROWSER_LAUNCH: 30000,
    PAGE_LOAD: 30000,
    PAGE_WAIT: 3000
  },

  // UI文本
  UI_TEXT: {
    ANALYZING: '解析中...',
    ANALYZE: '解析',
    READY: '就绪',
    PARSING: '正在解析',
    STOPPED: '正在停止解析...',
    PARSE_COMPLETE: '解析完成',
    APPEND_COMPLETE: '追加解析完成'
  },

  // 通知时间
  NOTIFICATION_DURATION: 1000, // 1秒 - 复制提示时间
  NOTIFICATION_DISPLAY_DURATION: 1500, // 1.5秒 - 系统通知显示时间

  // CSV表头
  CSV_HEADERS: ['视频链接', '视频标题', '频道名称', '频道订阅量', '播放量', '点赞数', '评论数', '发布日期'],

  // 表格表头
  TABLE_HEADERS: ['链接', '标题', '频道', '订阅量', '播放量', '点赞', '评论', '发布日期', '状态']
};