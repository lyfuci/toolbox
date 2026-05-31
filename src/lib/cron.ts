import { CronExpressionParser } from 'cron-parser'
import cronstrue from 'cronstrue'
import 'cronstrue/locales/zh_CN'

/**
 * Cron explainer helpers — pure, client-side, no network.
 *
 * We lean on two well-trodden libraries rather than hand-rolling cron's many
 * edge cases (day-of-week vs day-of-month OR-semantics, step/range/list combos,
 * @macros): `cronstrue` for the human sentence and `cron-parser` for the
 * upcoming fire times. Both run entirely in the browser.
 */

export type CronLocale = 'en' | 'zh_CN'

/**
 * Human-readable description of a cron expression in the requested locale.
 * Throws on an invalid expression (cronstrue surfaces a useful message).
 */
export function describeCron(expression: string, locale: CronLocale = 'en'): string {
  return cronstrue.toString(expression, {
    locale,
    throwExceptionOnParseError: true,
    use24HourTimeFormat: locale === 'zh_CN',
    verbose: false,
  })
}

/**
 * The next `count` fire times for a cron expression, evaluated in `tz`
 * (an IANA timezone, e.g. "Asia/Shanghai"). Returns JS Dates (absolute
 * instants). Throws on an invalid expression.
 */
export function nextRuns(expression: string, count = 5, tz?: string): Date[] {
  const interval = CronExpressionParser.parse(expression, tz ? { tz } : undefined)
  const out: Date[] = []
  for (let i = 0; i < count; i++) {
    out.push(interval.next().toDate())
  }
  return out
}

export type CronAnalysis =
  | { ok: true; description: string; runs: Date[] }
  | { ok: false; error: string }

/**
 * One-shot parse: description + next runs, or a single error. Keeps the page
 * component free of try/catch noise and guarantees both halves agree on
 * validity (cronstrue and cron-parser accept slightly different syntaxes, so
 * we require BOTH to succeed before calling the expression valid).
 */
export function analyzeCron(
  expression: string,
  opts: { locale?: CronLocale; count?: number; tz?: string } = {},
): CronAnalysis {
  const expr = expression.trim()
  if (!expr) return { ok: false, error: 'empty' }
  try {
    const description = describeCron(expr, opts.locale ?? 'en')
    const runs = nextRuns(expr, opts.count ?? 5, opts.tz)
    return { ok: true, description, runs }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
