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
        path: 'media',
        lazy: async () => ({ Component: (await import('@/pages/Media')).MediaPage }),
      },
    ],
  },
])
