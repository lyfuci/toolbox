import { Braces, KeyRound, Film, type LucideIcon } from 'lucide-react'

export type Tool = {
  slug: string
  path: string
  name: string
  description: string
  icon: LucideIcon
}

export const tools: Tool[] = [
  {
    slug: 'json',
    path: '/json',
    name: 'JSON',
    description: '格式化、压缩、校验 JSON',
    icon: Braces,
  },
  {
    slug: 'jwt',
    path: '/jwt',
    name: 'JWT',
    description: '解码、签发、校验 JSON Web Token',
    icon: KeyRound,
  },
  {
    slug: 'media',
    path: '/media',
    name: 'Media',
    description: '剪辑、拼接、提取音轨、格式转换（ffmpeg.wasm，本地处理）',
    icon: Film,
  },
]
