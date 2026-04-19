import {
  Binary,
  Braces,
  Calculator,
  Clock,
  CodeXml,
  FileSpreadsheet,
  Film,
  Hash,
  KeyRound,
  Link2,
  Palette,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

export const categories = [
  { slug: 'format', name: 'Format', description: '格式化、压缩、校验结构化数据' },
  { slug: 'encode', name: 'Encode / Decode', description: '编解码、Token 解析' },
  { slug: 'hash', name: 'Hash / Crypto', description: '哈希与签名（本地计算）' },
  { slug: 'convert', name: 'Convert', description: '常用单位 / 进制 / 时间互转' },
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
