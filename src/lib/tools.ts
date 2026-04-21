import {
  Binary,
  Braces,
  Calculator,
  CaseSensitive,
  Clock,
  CodeXml,
  Dices,
  Diff,
  FileCode,
  FileSpreadsheet,
  FileText,
  Film,
  Globe,
  Hash,
  KeyRound,
  Link2,
  ListOrdered,
  Lock,
  Network,
  Palette,
  QrCode,
  Regex,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

// Order: Encode/Decode and Generate pinned to the top per user request,
// then the rest by tool count desc (with ties broken by everyday-use frequency),
// Media kept last since it's heavy and niche.
export const categories = [
  { slug: 'encode', name: 'Encode / Decode', description: '编解码、Token 解析' },
  { slug: 'generate', name: 'Generate', description: 'UUID / 密码 / 二维码 / 占位文本' },
  { slug: 'convert', name: 'Convert', description: '常用单位 / 进制 / 时间互转' },
  { slug: 'text', name: 'Text', description: '文本处理：差异 / 大小写 / 排序 / 正则' },
  { slug: 'format', name: 'Format', description: '格式化、压缩、校验结构化数据' },
  { slug: 'network', name: 'Network', description: 'IP / DNS / 子网（含公共 API 查询）' },
  { slug: 'hash', name: 'Hash / Crypto', description: '哈希与签名（本地计算）' },
  { slug: 'media', name: 'Media', description: '音视频处理（本地）' },
] as const

export type CategorySlug = (typeof categories)[number]['slug']

export type Tool = {
  slug: string
  path: string
  name: string
  description: string
  icon: LucideIcon
  category: CategorySlug
}

export const tools: Tool[] = [
  {
    slug: 'json',
    path: '/json',
    name: 'JSON',
    description: '格式化、压缩、校验 JSON',
    icon: Braces,
    category: 'format',
  },
  {
    slug: 'xml',
    path: '/xml',
    name: 'XML',
    description: '格式化、压缩、校验 XML',
    icon: FileCode,
    category: 'format',
  },
  {
    slug: 'yaml',
    path: '/yaml',
    name: 'YAML',
    description: 'YAML ↔ JSON 互转',
    icon: FileText,
    category: 'format',
  },
  {
    slug: 'base64',
    path: '/base64',
    name: 'Base64',
    description: 'Base64 编解码（UTF-8、URL-safe）',
    icon: Binary,
    category: 'encode',
  },
  {
    slug: 'url',
    path: '/url',
    name: 'URL',
    description: 'URL 编解码（component / uri）',
    icon: Link2,
    category: 'encode',
  },
  {
    slug: 'hex',
    path: '/hex',
    name: 'Hex',
    description: '文本 ↔ 十六进制字节',
    icon: Hash,
    category: 'encode',
  },
  {
    slug: 'html-entity',
    path: '/html-entity',
    name: 'HTML Entity',
    description: 'HTML 实体编解码',
    icon: CodeXml,
    category: 'encode',
  },
  {
    slug: 'jwt',
    path: '/jwt',
    name: 'JWT',
    description: '解码、签发、校验 JSON Web Token',
    icon: KeyRound,
    category: 'encode',
  },
  {
    slug: 'hash',
    path: '/hash',
    name: 'Hash',
    description: '同时输出 MD5 / SHA-1 / SHA-256 / SHA-384 / SHA-512',
    icon: Hash,
    category: 'hash',
  },
  {
    slug: 'hmac',
    path: '/hmac',
    name: 'HMAC',
    description: '基于 Web Crypto 的 HMAC 签名',
    icon: ShieldCheck,
    category: 'hash',
  },
  {
    slug: 'timestamp',
    path: '/timestamp',
    name: 'Timestamp',
    description: '时间戳 ↔ 日期（Unix / ISO / RFC）',
    icon: Clock,
    category: 'convert',
  },
  {
    slug: 'color',
    path: '/color',
    name: 'Color',
    description: 'HEX / RGB / HSL 互转',
    icon: Palette,
    category: 'convert',
  },
  {
    slug: 'number-base',
    path: '/number-base',
    name: 'Number Base',
    description: '整数进制互转（基于 BigInt）',
    icon: Calculator,
    category: 'convert',
  },
  {
    slug: 'csv-json',
    path: '/csv-json',
    name: 'CSV ↔ JSON',
    description: 'CSV 与 JSON 互转',
    icon: FileSpreadsheet,
    category: 'convert',
  },
  {
    slug: 'uuid',
    path: '/uuid',
    name: 'UUID',
    description: 'UUID v4 批量生成（crypto.randomUUID）',
    icon: Dices,
    category: 'generate',
  },
  {
    slug: 'password',
    path: '/password',
    name: 'Password',
    description: 'CSPRNG 随机密码生成器',
    icon: Lock,
    category: 'generate',
  },
  {
    slug: 'qr-code',
    path: '/qr-code',
    name: 'QR Code',
    description: '二维码生成（SVG / PNG，本地）',
    icon: QrCode,
    category: 'generate',
  },
  {
    slug: 'lorem',
    path: '/lorem',
    name: 'Lorem Ipsum',
    description: '占位文本生成（段落 / 句子 / 单词）',
    icon: FileText,
    category: 'generate',
  },
  {
    slug: 'diff',
    path: '/diff',
    name: 'Diff',
    description: '文本差异对比（行级 / 词级）',
    icon: Diff,
    category: 'text',
  },
  {
    slug: 'case',
    path: '/case',
    name: 'Case Convert',
    description: '命名风格互转（camel / snake / kebab 等）',
    icon: CaseSensitive,
    category: 'text',
  },
  {
    slug: 'sort-dedupe',
    path: '/sort-dedupe',
    name: 'Sort & Dedupe',
    description: '按行排序、去重、修剪',
    icon: ListOrdered,
    category: 'text',
  },
  {
    slug: 'regex',
    path: '/regex',
    name: 'Regex Tester',
    description: '正则匹配、捕获组、替换预览',
    icon: Regex,
    category: 'text',
  },
  {
    slug: 'ip-info',
    path: '/ip-info',
    name: 'IP Info',
    description: 'IP 归属查询（ipapi.co，点击触发）',
    icon: Globe,
    category: 'network',
  },
  {
    slug: 'dns',
    path: '/dns',
    name: 'DNS Lookup',
    description: 'DNS 解析（Cloudflare DoH，点击触发）',
    icon: Network,
    category: 'network',
  },
  {
    slug: 'cidr',
    path: '/cidr',
    name: 'CIDR Calculator',
    description: 'IPv4 子网计算（本地）',
    icon: Network,
    category: 'network',
  },
  {
    slug: 'media',
    path: '/media',
    name: 'Media',
    description: '剪辑、拼接、提取音轨、格式转换（ffmpeg.wasm，本地处理）',
    icon: Film,
    category: 'media',
  },
]

export type CategoryWithTools = (typeof categories)[number] & { tools: Tool[] }

// Categories that have at least one tool, in the declared order. Empty
// categories are filtered out so the UI doesn't advertise a roadmap.
export function toolsByCategory(): CategoryWithTools[] {
  return categories
    .map((cat) => ({ ...cat, tools: tools.filter((t) => t.category === cat.slug) }))
    .filter((g) => g.tools.length > 0)
}
