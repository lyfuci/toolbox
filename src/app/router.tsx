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
        path: 'jwt',
        lazy: async () => ({ Component: (await import('@/pages/Jwt')).JwtPage }),
      },
      {
        path: 'media',
        lazy: async () => ({ Component: (await import('@/pages/Media')).MediaPage }),
      },
    ],
  },
])
