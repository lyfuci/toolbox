import { createBrowserRouter } from 'react-router'
import { Layout } from '@/app/Layout'

// Lazy-load each tool route so the initial bundle stays small. Each tool
// becomes its own chunk and only downloads when the user navigates to it.
export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      {
        index: true,
        lazy: async () => ({ Component: (await import('@/pages/Home')).HomePage }),
      },
      {
        path: 'json',
        lazy: async () => ({ Component: (await import('@/pages/Json')).JsonPage }),
      },
      {
        path: 'xml',
        lazy: async () => ({ Component: (await import('@/pages/Xml')).XmlPage }),
      },
      {
        path: 'yaml',
        lazy: async () => ({ Component: (await import('@/pages/Yaml')).YamlPage }),
      },
      {
        path: 'base64',
        lazy: async () => ({ Component: (await import('@/pages/Base64')).Base64Page }),
      },
      {
        path: 'url',
        lazy: async () => ({ Component: (await import('@/pages/Url')).UrlPage }),
      },
      {
        path: 'hex',
        lazy: async () => ({ Component: (await import('@/pages/Hex')).HexPage }),
      },
      {
        path: 'html-entity',
        lazy: async () => ({ Component: (await import('@/pages/HtmlEntity')).HtmlEntityPage }),
      },
      {
        path: 'jwt',
        lazy: async () => ({ Component: (await import('@/pages/Jwt')).JwtPage }),
      },
      {
        path: 'hash',
        lazy: async () => ({ Component: (await import('@/pages/Hash')).HashPage }),
      },
      {
        path: 'hmac',
        lazy: async () => ({ Component: (await import('@/pages/Hmac')).HmacPage }),
      },
      {
        path: 'timestamp',
        lazy: async () => ({ Component: (await import('@/pages/Timestamp')).TimestampPage }),
      },
      {
        path: 'color',
        lazy: async () => ({ Component: (await import('@/pages/Color')).ColorPage }),
      },
      {
        path: 'number-base',
        lazy: async () => ({ Component: (await import('@/pages/NumberBase')).NumberBasePage }),
      },
      {
        path: 'csv-json',
        lazy: async () => ({ Component: (await import('@/pages/CsvJson')).CsvJsonPage }),
      },
      {
        path: 'uuid',
        lazy: async () => ({ Component: (await import('@/pages/Uuid')).UuidPage }),
      },
      {
        path: 'password',
        lazy: async () => ({ Component: (await import('@/pages/Password')).PasswordPage }),
      },
      {
        path: 'qr-code',
        lazy: async () => ({ Component: (await import('@/pages/QrCode')).QrCodePage }),
      },
      {
        path: 'lorem',
        lazy: async () => ({ Component: (await import('@/pages/Lorem')).LoremPage }),
      },
      {
        path: 'diff',
        lazy: async () => ({ Component: (await import('@/pages/Diff')).DiffPage }),
      },
      {
        path: 'case',
        lazy: async () => ({ Component: (await import('@/pages/CaseConvert')).CaseConvertPage }),
      },
      {
        path: 'sort-dedupe',
        lazy: async () => ({ Component: (await import('@/pages/SortDedupe')).SortDedupePage }),
      },
      {
        path: 'regex',
        lazy: async () => ({ Component: (await import('@/pages/Regex')).RegexPage }),
      },
      {
        path: 'ip-info',
        lazy: async () => ({ Component: (await import('@/pages/IpInfo')).IpInfoPage }),
      },
      {
        path: 'dns',
        lazy: async () => ({ Component: (await import('@/pages/Dns')).DnsPage }),
      },
      {
        path: 'cidr',
        lazy: async () => ({ Component: (await import('@/pages/Cidr')).CidrPage }),
      },
      {
        path: 'media',
        lazy: async () => ({ Component: (await import('@/pages/Media')).MediaPage }),
      },
    ],
  },
])
