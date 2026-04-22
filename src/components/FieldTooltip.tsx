import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Props = {
  /** Either a translation key (resolved via i18next) or a literal ReactNode. */
  body: string | ReactNode
  /** When `body` is a string, treat it as an i18n key first; fall back to literal if missing. */
  bodyIsKey?: boolean
  children: ReactNode
  /** Defaults to `true` — adds a subtle dotted underline to hint hoverability. */
  underline?: boolean
  className?: string
}

/**
 * Wrap a span/inline element with a hover tooltip describing it. Designed for
 * RFC-sourced field-meaning hints (JWT claims, DNS record types, regex flags…).
 *
 * Pass either a literal `body` (already-translated string or a JSX element) or
 * an i18n key with `bodyIsKey`. If the key doesn't exist in the catalog we
 * silently render the children without the tooltip — keeps the UI usable for
 * fields we haven't documented.
 */
export function FieldTooltip({
  body,
  bodyIsKey = false,
  children,
  underline = true,
  className,
}: Props) {
  const { t, i18n } = useTranslation()

  let resolved: ReactNode = null
  if (bodyIsKey && typeof body === 'string') {
    if (!i18n.exists(body)) {
      // No tooltip data for this field — render children plain.
      return <>{children}</>
    }
    resolved = t(body)
  } else {
    resolved = body
  }

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              underline && 'cursor-help underline decoration-dotted decoration-muted-foreground/50 underline-offset-4',
              className,
            )}
          >
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm whitespace-pre-line text-xs leading-relaxed">
          {resolved}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
