import { Braces, Film, KeyRound, type LucideIcon } from 'lucide-react'

export const categories = [
  { slug: 'format', name: 'Format', description: '格式化、压缩、校验结构化数据' },
  { slug: 'encode', name: 'Encode / Decode', description: '编解码、Token 解析' },
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
    slug: 'jwt',
    path: '/jwt',
    name: 'JWT',
    description: '解码、签发、校验 JSON Web Token',
    icon: KeyRound,
    category: 'encode',
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
