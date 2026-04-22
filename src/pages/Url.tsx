import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EncodeDecode } from '@/components/EncodeDecode'

const SAMPLE = 'https://example.com/path?key=值 1&hello=世界'

type Variant = 'component' | 'uri'

const VARIANT_LABELS: Record<Variant, string> = {
  component: 'Component',
  uri: 'URI',
}

export function UrlPage() {
  const { t } = useTranslation()
  const [variant, setVariant] = useState<Variant>('component')

  const encode = useCallback(
    (s: string) => (variant === 'component' ? encodeURIComponent(s) : encodeURI(s)),
    [variant],
  )
  const decode = useCallback(
    (s: string) => (variant === 'component' ? decodeURIComponent(s) : decodeURI(s)),
    [variant],
  )

  return (
    <EncodeDecode
      title={t('tools.url.name')}
      description={t('pages.url.description')}
      encode={encode}
      decode={decode}
      sample={SAMPLE}
      options={
        <div className="flex rounded-md border border-input bg-transparent text-xs">
          {(['component', 'uri'] as Variant[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVariant(v)}
              className={`px-2.5 py-1 transition-colors ${
                variant === v
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {VARIANT_LABELS[v]}
            </button>
          ))}
        </div>
      }
    />
  )
}
