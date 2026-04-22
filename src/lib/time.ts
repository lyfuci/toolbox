/**
 * Format a Date as "Y-MM-DD HH:mm:ss" in the user's locale.
 * Uses Intl.DateTimeFormat for locale-correct numbers / separators.
 */
export function formatLocalDateTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

/** ISO 8601 in UTC, second precision (no fractional ms). */
export function formatIso8601Utc(date: Date): string {
  return date.toISOString().replace(/\.\d+Z$/, 'Z')
}

/**
 * Locale-correct relative time using Intl.RelativeTimeFormat.
 * Picks the largest sensible unit (seconds → years).
 */
export function formatRelative(date: Date, locale: string): string {
  const diffMs = date.getTime() - Date.now()
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const abs = Math.abs(diffMs)
  if (abs < 60_000) return fmt.format(Math.round(diffMs / 1000), 'second')
  if (abs < 3_600_000) return fmt.format(Math.round(diffMs / 60_000), 'minute')
  if (abs < 86_400_000) return fmt.format(Math.round(diffMs / 3_600_000), 'hour')
  if (abs < 30 * 86_400_000) return fmt.format(Math.round(diffMs / 86_400_000), 'day')
  if (abs < 365 * 86_400_000) return fmt.format(Math.round(diffMs / (30 * 86_400_000)), 'month')
  return fmt.format(Math.round(diffMs / (365 * 86_400_000)), 'year')
}

/** Convenience: format a Unix-seconds timestamp as 3-line breakdown text. */
export function formatTimestampBreakdown(
  unixSeconds: number,
  locale: string,
): { utc: string; local: string; relative: string } {
  const date = new Date(unixSeconds * 1000)
  return {
    utc: formatIso8601Utc(date),
    local: formatLocalDateTime(date, locale),
    relative: formatRelative(date, locale),
  }
}
