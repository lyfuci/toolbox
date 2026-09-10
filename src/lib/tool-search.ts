// Search terms for the command palette (⌘K).
//
// Two problems this solves:
//
//  1. The palette used to match only the ACTIVE locale's tool name and
//     description, so a Chinese UI never matched "image" and an English UI
//     never matched "图片". Every locale's strings now go into the keyword
//     list, whichever language the UI is in.
//  2. Tool names are terse and often untranslated ("Timestamp", "Diff"), so
//     the words people actually type — "picture", "压缩", "子网", "正则" —
//     appeared nowhere. Hence the alias table below.
//
// Adding a tool? Add its aliases here too. `toolSearchKeywords` drops any
// alias the tool's own names/descriptions already contain, so err on the side
// of listing a term rather than checking first.
//
// What makes a good alias, learned from auditing this table:
//   • cover both languages, always;
//   • prefer the word the user has in their head (the verb: crop, 压缩, merge)
//     over a restatement of the tool's title;
//   • don't claim a job the tool can't do — no "excel" on a CSV-text parser;
//   • don't attach another tool's identity — "kebab case" belongs to Case
//     Convert, not Slugify.

export const TOOL_ALIASES: Readonly<Record<string, readonly string[]>> = {
  // format
  json: ['beautify', 'prettify', 'formatter', 'jq', '.json', '美化', '缩进', '校验'],
  xml: ['beautify', 'prettify', 'formatter', '.xml', '美化', '缩进', '校验'],
  yaml: ['yml', '.yml', '.yaml', 'beautify', 'prettify', 'formatter', '美化', 'yaml转json', 'json转yaml'],
  'json-to-ts': ['ts', '.d.ts', 'types', 'type definition', 'quicktype', 'codegen', 'json转ts', '类型', '类型定义'],

  // encode / decode
  base64: ['b64', 'atob', 'btoa', 'data uri', 'data url', 'base64 to image', '编码', '解码', 'base64转图片', 'base64转文件'],
  url: ['urlencode', 'urldecode', 'encodeuricomponent', 'decodeuricomponent', '%20', 'uri', '网址', '链接', '网址编码', 'url编码', 'url解码'],
  hex: ['base16', '0x', 'hexdump', 'ascii to hex', 'string to hex', '16进制', '字节'],
  'html-entity': ['nbsp', 'htmlspecialchars', 'html encode', '反转义', '特殊字符', '网页转义'],
  jwt: ['bearer', 'jws', 'claims', 'payload', 'signature', 'hs256', 'rs256', 'token', 'access token', 'id token', '令牌', '签名', '鉴权', '认证', 'token解析'],
  escape: ['unescape', 'backslash', 'quotes', 'javascript', 'shell', '反斜杠', '引号', '反转义', '还原'],
  unicode: ['utf-8', 'utf-16', 'emoji', 'u+', 'zero width', 'zwsp', 'bom', 'ascii', 'char code', '字符集', '零宽字符', '表情', '乱码', '隐藏字符', '全角半角'],

  // hash / crypto
  hash: ['checksum', 'digest', 'fingerprint', 'sha', 'file checksum', '哈希', '散列', '摘要', '校验和', '文件校验', '指纹', 'md5校验'],
  hmac: ['sign', 'message authentication code', 'api签名', 'webhook签名', '签名', '验签', '消息认证码'],

  // convert
  timestamp: ['epoch', 'unix', 'unix time', 'milliseconds', 'iso 8601', 'utc', 'gmt', 'now', 'current time', 'timezone', '时间戳', '毫秒', '秒数', '当前时间', '时区', '日期转换', '时间戳转日期'],
  cron: ['crontab', 'cron job', 'schedule', 'scheduler', 'quartz', '定时任务', '计划任务', '定时器', '调度', '周期执行'],
  color: ['颜色', '色值', '色号', '颜色转换', '取色器', 'color picker', '调色板', 'palette', 'hsv', 'rgba', 'css color'],
  'number-base': ['bin', 'oct', 'dec', 'radix', 'base 2', 'base 16', 'binary', 'decimal', 'octal', '0b', '进制', '进制转换', '数制转换', '二进制', '十进制'],
  'csv-json': ['spreadsheet', 'tsv', 'delimited', 'csv to json', 'json to csv', 'excel csv', '表格', '表格数据', '逗号分隔', '分隔符', 'csv转json', 'json转csv'],
  chmod: ['755', '644', '777', 'rwx', 'octal', 'file mode', '权限', '读写执行', '文件模式', '目录权限', 'linux权限', '八进制权限'],
  dotenv: ['.env', 'env vars', 'environment variables', 'envfile', 'key value', '环境变量', '配置文件', '键值对'],

  // network
  'http-status': ['404', '500', '403', '301', '200', '401', '429', '503', 'error code', 'response code', 'not found', '错误码', '响应码', '返回码', 'http错误'],
  'ip-info': ['my ip', 'ip address', 'geoip', 'whois', 'ip location', 'asn', 'ipv4', 'ipv6', '我的ip', 'ip地址', 'ip定位', '公网ip', '归属地'],
  translate: ['translation', 'translator', 'i18n', 'language', 'chinese', 'english', 'japanese',
    '翻译', '翻譯', '译文', '中译英', '英译中', '机翻', '语言'],
  dns: ['nslookup', 'dig', 'cname', 'srv', 'domain', 'resolve', 'nameserver', '域名', '域名解析', 'dns解析'],
  cidr: ['netmask', 'ip range', 'prefix length', 'network address', 'broadcast', 'subnet', 'subnet mask', 'ipv4', '网段', 'ip段', '子网', '子网掩码', '广播地址', 'ip计算器'],

  // generate
  uuid: ['guid', 'unique id', 'random id', 'id generator', '唯一id', '随机id', '唯一标识符', '通用唯一识别码'],
  password: ['passwd', 'pwd', 'passphrase', 'random string', 'pwned', 'have i been pwned', 'leaked', '密码', '口令', '随机密码', '密码泄漏', '强密码'],
  'qr-code': ['qrcode', 'qr reader', 'decode qr', '二维码', '扫码', '扫一扫', '二维码扫描', '生成二维码'],
  lorem: ['lipsum', 'dummy text', 'filler text', 'placeholder', '乱数假文', '假文', '测试文字', '填充文字'],

  // text
  diff: ['difference', 'compare', 'compare text', 'text diff', 'patch', 'git diff', 'unified diff', '对比', '差异', '文本对比', '比较', '找不同'],
  case: ['camel', 'camelcase', 'pascalcase', 'uppercase', 'lowercase', 'capitalize', 'title case', 'kebab case', 'snake case', '大小写', '大小写转换', '驼峰', '下划线', '短横线', '命名转换'],
  'sort-dedupe': ['unique', 'uniq', 'deduplicate', 'distinct', 'alphabetize', '去重', '文本去重', '行去重', '字母排序', '升序', '降序', '排序'],
  regex: ['regexp', 'regular expression', 'pattern', 'capture group', 'regex101', 'grep', '正则', '正则表达式', '正则测试', '匹配', '模式匹配'],
  'text-stats': ['wordcount', 'word counter', 'letter count', 'text length', 'how many words', '字数', '字数统计', '文本长度', '字符数', '多少字', '计数'],
  slugify: ['permalink', 'seo', 'url path', 'friendly url', '固定链接', '链接别名', '文章链接', '路径生成'],
  markdown: ['md', '.md', 'readme', 'commonmark', 'md viewer', 'markdown editor', '转html', '标记语言', '文档预览', 'md渲染'],

  // file convert
  pdf: ['pdf to jpg', 'pdf to image', 'pdf to png', 'pdf2img', 'rasterize', 'pdf转图片', 'pdf转jpg', 'pdf转png', '导出图片', '光栅化'],
  'images-to-pdf': ['merge images', 'jpg to pdf', 'png to pdf', 'photo to pdf', 'img2pdf', 'scan to pdf', 'combine', '照片转pdf', '图像转pdf', '多图合成', '合并图片', '扫描件转pdf', '生成pdf'],

  // media
  'image-editor': ['photo', 'picture', 'pic', 'img', 'ps', 'photoshop', 'gimp', 'crop', 'resize', 'rotate', 'flip', 'watermark', 'remove background', '图片', '照片', '图像', '修图', 'p图', '抠图', '裁剪', '调整大小', '旋转', '翻转', '水印', '去背景'],
  'image-compress': ['photo', 'picture', 'pic', 'img', 'optimize', 'reduce file size', 'tinypng', 'shrink', 'png to jpg', 'jpg to webp', 'convert image format', '图片', '照片', '图像', '缩小', '减小体积', '图片瘦身', '转webp', 'png转jpg', '图片格式转换', '批量压缩'],
  media: ['video', 'video editor', 'mp4', 'mov', 'mp3', 'wav', 'srt', 'ffmpeg', 'extract audio', 'compress video', 'convert video', 'concat', '视频', '音频', '剪辑', '剪视频', '提取音频', '压缩视频', '视频转码', '加字幕', '变速', '拼接视频'],
}

/**
 * Keywords cmdk should match a tool against: every locale's name, description
 * and category, plus the aliases that add something those strings don't
 * already contain. Case-insensitive de-duplication, stable order.
 */
export function toolSearchKeywords(
  localizedTexts: readonly string[],
  aliases: readonly string[] = [],
): string[] {
  const texts = localizedTexts.map((s) => s.trim()).filter(Boolean)
  const haystack = texts.join('   ').toLowerCase()
  const seen = new Set<string>()
  const out: string[] = []

  const add = (raw: string) => {
    const value = raw.trim()
    const key = value.toLowerCase()
    if (!value || seen.has(key)) return
    seen.add(key)
    out.push(value)
  }

  texts.forEach(add)
  for (const alias of aliases) {
    const key = alias.trim().toLowerCase()
    if (key && !haystack.includes(key)) add(alias)
  }
  return out
}
