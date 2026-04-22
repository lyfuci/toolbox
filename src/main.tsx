import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { ThemeProvider } from 'next-themes'
import { router } from '@/app/router'
import { Toaster } from '@/components/ui/sonner'
import '@/i18n'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </ThemeProvider>
  </StrictMode>,
)
