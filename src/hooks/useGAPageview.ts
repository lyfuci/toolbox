import { useEffect } from 'react'
import { useLocation } from 'react-router'

// gtag.js auto-fires page_view on initial document load only. We disabled that
// in index.html (`send_page_view: false`) so this hook is the single source of
// truth — covers initial mount AND every SPA navigation.
export function useGAPageview() {
  const location = useLocation()
  useEffect(() => {
    window.gtag?.('event', 'page_view', {
      page_path: location.pathname + location.search,
      page_title: document.title,
      page_location: window.location.href,
    })
  }, [location.pathname, location.search])
}
