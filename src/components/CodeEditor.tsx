import { useMemo } from 'react'
import CodeMirror, { type ReactCodeMirrorProps } from '@uiw/react-codemirror'
import { json as cmJson } from '@codemirror/lang-json'
import { xml as cmXml } from '@codemirror/lang-xml'
import { yaml as cmYaml } from '@codemirror/lang-yaml'
import { EditorView } from '@codemirror/view'
import { cn } from '@/lib/utils'

/**
 * Shared CodeMirror 6 wrapper used by JSON / XML / YAML / Diff / Regex tools.
 *
 * Why a wrapper:
 *  - Pins a consistent visual theme that picks up shadcn semantic tokens
 *    (background, foreground, border) via CSS variables so dark/light mode
 *    swaps for free.
 *  - Selects the language extension by string name so callers don't have to
 *    pull each `@codemirror/lang-*` package themselves.
 *  - Caps line height + adds error-line decoration via the `errorLine` prop
 *    so the JSON / YAML pages can highlight the parse-error line cheaply.
 *
 * Not exhaustive of CodeMirror's options — callers needing decorations
 * beyond the supplied props can pass extra `extensions`.
 */

export type CodeLang = 'json' | 'xml' | 'yaml' | 'plain'

type Props = Omit<ReactCodeMirrorProps, 'extensions' | 'theme'> & {
  language?: CodeLang
  /** Additional extensions to layer in (e.g. read-only, custom decorations). */
  extraExtensions?: ReactCodeMirrorProps['extensions']
  className?: string
}

const langExtensions: Record<CodeLang, () => ReactCodeMirrorProps['extensions']> = {
  json: () => [cmJson()],
  xml: () => [cmXml()],
  yaml: () => [cmYaml()],
  plain: () => [],
}

/**
 * Theme extension that maps CodeMirror's editor colours onto the shadcn
 * semantic tokens. Picks up dark / light via `--background` / `--foreground`
 * etc., so a `html.dark` toggle elsewhere doesn't need a separate handler.
 */
const themeExtension = EditorView.theme({
  '&': {
    backgroundColor: 'var(--background)',
    color: 'var(--foreground)',
    fontSize: '12px',
  },
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    caretColor: 'var(--foreground)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--card, var(--background))',
    color: 'var(--muted-foreground)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': {
    backgroundColor: 'color-mix(in oklab, var(--accent) 25%, transparent)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'color-mix(in oklab, var(--accent) 25%, transparent)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--primary) 35%, transparent)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
})

export function CodeEditor({
  language = 'plain',
  extraExtensions,
  className,
  ...rest
}: Props) {
  const exts = useMemo(() => {
    const arr = [
      ...(langExtensions[language]?.() ?? []),
      themeExtension,
      EditorView.lineWrapping,
    ]
    if (extraExtensions) arr.push(...extraExtensions)
    return arr
  }, [language, extraExtensions])

  return (
    <div
      className={cn(
        'overflow-hidden rounded-md border border-input bg-background',
        className,
      )}
    >
      <CodeMirror
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLineGutter: true,
          highlightActiveLine: false,
          dropCursor: true,
          allowMultipleSelections: false,
          indentOnInput: true,
          bracketMatching: true,
          autocompletion: false,
          highlightSelectionMatches: false,
          searchKeymap: false,
        }}
        extensions={exts}
        {...rest}
      />
    </div>
  )
}
