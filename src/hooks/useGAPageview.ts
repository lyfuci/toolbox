import { useEffect } from 'react'
import { useLocation } from 'react-router'

// gtag.js auto-fires page_view on initial document load only. We disabled that
// in index.html (`send_page_view: false`) so this hook is the single source of
// truth — covers initial mount AND every SPA navigation.
//
// Wrapped in try/catch: analytics must never affect UX. If gtag is missing
// (script blocked) or its internals throw (corrupted response, COEP-blocked
// child request), we swallow silently rather than letting it bubble up to
// the React render loop.
export function useGAPageview() {
  const location = useLocation()
  useEffect(() => {
    try {
      window.gtag?.('event', 'page_view', {
        page_path: location.pathname + location.search,
        page_title: document.title,
        page_location: window.location.href,
      })
    } catch {
      /* analytics is best-effort; never let it surface */
    }
  }, [location.pathname, location.search])
}
