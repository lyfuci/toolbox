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

// Categories in display order. Name + description live in the i18n catalogs
// under `categories.<slug>.*` — consumers should call `t()` to render them.
// Order: Encode/Decode and Generate pinned to the top per user request,
// then the rest by tool count desc (with ties broken by everyday-use frequency),
// Media kept last since it's heavy and niche.
export const categories = [
  { slug: 'encode' },
  { slug: 'generate' },
  { slug: 'convert' },
  { slug: 'text' },
  { slug: 'format' },
  { slug: 'network' },
  { slug: 'hash' },
  { slug: 'media' },
] as const

export type CategorySlug = (typeof categories)[number]['slug']

export type Tool = {
  slug: string
  path: string
  icon: LucideIcon
  category: CategorySlug
}

// Tools in per-category display order. Name + description in i18n catalogs
// under `tools.<slug>.*`.
export const tools: Tool[] = [
  { slug: 'json', path: '/json', icon: Braces, category: 'format' },
  { slug: 'xml', path: '/xml', icon: FileCode, category: 'format' },
  { slug: 'yaml', path: '/yaml', icon: FileText, category: 'format' },
  { slug: 'base64', path: '/base64', icon: Binary, category: 'encode' },
  { slug: 'url', path: '/url', icon: Link2, category: 'encode' },
  { slug: 'hex', path: '/hex', icon: Hash, category: 'encode' },
  { slug: 'html-entity', path: '/html-entity', icon: CodeXml, category: 'encode' },
  { slug: 'jwt', path: '/jwt', icon: KeyRound, category: 'encode' },
  { slug: 'hash', path: '/hash', icon: Hash, category: 'hash' },
  { slug: 'hmac', path: '/hmac', icon: ShieldCheck, category: 'hash' },
  { slug: 'timestamp', path: '/timestamp', icon: Clock, category: 'convert' },
  { slug: 'color', path: '/color', icon: Palette, category: 'convert' },
  { slug: 'number-base', path: '/number-base', icon: Calculator, category: 'convert' },
  { slug: 'csv-json', path: '/csv-json', icon: FileSpreadsheet, category: 'convert' },
  { slug: 'uuid', path: '/uuid', icon: Dices, category: 'generate' },
  { slug: 'password', path: '/password', icon: Lock, category: 'generate' },
  { slug: 'qr-code', path: '/qr-code', icon: QrCode, category: 'generate' },
  { slug: 'lorem', path: '/lorem', icon: FileText, category: 'generate' },
  { slug: 'diff', path: '/diff', icon: Diff, category: 'text' },
  { slug: 'case', path: '/case', icon: CaseSensitive, category: 'text' },
  { slug: 'sort-dedupe', path: '/sort-dedupe', icon: ListOrdered, category: 'text' },
  { slug: 'regex', path: '/regex', icon: Regex, category: 'text' },
  { slug: 'ip-info', path: '/ip-info', icon: Globe, category: 'network' },
  { slug: 'dns', path: '/dns', icon: Network, category: 'network' },
  { slug: 'cidr', path: '/cidr', icon: Network, category: 'network' },
  { slug: 'media', path: '/media', icon: Film, category: 'media' },
]

export type CategoryWithTools = { slug: CategorySlug; tools: Tool[] }

// Categories that have at least one tool, in the declared order.
export function toolsByCategory(): CategoryWithTools[] {
  return categories
    .map((cat) => ({ slug: cat.slug, tools: tools.filter((t) => t.category === cat.slug) }))
    .filter((g) => g.tools.length > 0)
}
