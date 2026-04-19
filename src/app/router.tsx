import { createBrowserRouter } from 'react-router'
import { Layout } from '@/app/Layout'
import { HomePage } from '@/pages/Home'
import { JsonPage } from '@/pages/Json'
import { JwtPage } from '@/pages/Jwt'
import { MediaPage } from '@/pages/Media'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: Layout,
    children: [
      { index: true, Component: HomePage },
      { path: 'json', Component: JsonPage },
      { path: 'jwt', Component: JwtPage },
      { path: 'media', Component: MediaPage },
    ],
  },
])
