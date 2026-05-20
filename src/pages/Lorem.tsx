import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Copy, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'

const SOURCES = {
  lorem: `lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod
tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis
nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis
aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur
excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt
mollit anim id est laborum`,
  hipster: `artisan bespoke craft beard tattoo brewery bicycle vinyl flannel
mason organic locavore sustainable kombucha quinoa kale fixie selvage gentrify
chia plaid pour-over cold-press denim taxidermy ethical raw fair-trade pop-up
typewriter mustache man-bun keffiyeh narwhal vegan pinterest helvetica cliche
gluten free pickled cardigan retro etsy hashtag biodiesel marfa church-key
direct-trade kale single-origin coffee thundercats yr seitan vhs jean shorts
listicle viral squid franzen schlitz drinking truffaut wolf moon photo booth`,
  pirate: `arr ahoy avast aye matey scallywag scurvy hearty bilge bounty
buccaneer doubloon galleon gangplank grog jolly roger keelhaul landlubber lass
loot maroon plank plunder shanty schooner cutlass quarterdeck rum sail booty
sea-dog shipmate skull crossbones smartly swab swashbuckle treasure parley
captain crew yo-ho-ho mainsail mizzen brig sloop frigate cannonball cannon
cargo barnacle hornswaggle yarr fathom landfall maelstrom anchor blunderbuss
sextant compass musket dagger eyepatch parrot peg-leg fore aft starboard port
billow knot hold rigging mast tiller rudder helm chest gem coin pearl harbor`,
  bacon: `bacon ipsum pork chop ham shank loin sausage rib chuck brisket
meatball pancetta short ribs short loin t-bone bresaola filet mignon ribeye
prosciutto kielbasa drumstick frankfurter andouille capicola tongue tail belly
shoulder picanha chislic boudin sirloin tenderloin pastrami salami spare ribs
buffalo turkey corned beef strip steak burgdoggen biltong landjaeger pig
flank jerky leberkas jowl venison cow chicken cured smoked pickled grilled
seared roasted fatback hock cutlet hamburger meatloaf swine porchetta
ground round meat lover smoke smoker rub rub-down brine seasoning glaze`,
} as const

type Source = keyof typeof SOURCES

function tokenize(src: string): string[] {
  return src.toLowerCase().split(/\s+/).filter(Boolean)
}

function pick(words: string[]): string {
  return words[Math.floor(Math.random() * words.length)]
}

function genWords(words: string[], n: number): string[] {
  return Array.from({ length: n }, () => pick(words))
}

function capitalize(w: string): string {
  return w[0].toUpperCase() + w.slice(1)
}

function genSentence(words: string[]): string {
  const len = 8 + Math.floor(Math.random() * 12)
  const ws = genWords(words, len)
  return capitalize(ws[0]) + ' ' + ws.slice(1).join(' ') + '.'
}

function genParagraph(words: string[]): string {
  const len = 4 + Math.floor(Math.random() * 5)
  return Array.from({ length: len }, () => genSentence(words)).join(' ')
}

type Mode = 'paragraphs' | 'sentences' | 'words'

const LOREM_START = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.'

function generate(
  source: Source,
  mode: Mode,
  count: number,
  startWithLorem: boolean,
  asHtml: boolean,
): string {
  const words = tokenize(SOURCES[source])
  let paragraphs: string[]
  if (mode === 'paragraphs') {
    paragraphs = Array.from({ length: count }, () => genParagraph(words))
    if (startWithLorem && source === 'lorem' && paragraphs.length > 0) {
      paragraphs[0] = LOREM_START + ' ' + paragraphs[0]
    }
  } else if (mode === 'sentences') {
    const sentences = Array.from({ length: count }, () => genSentence(words))
    if (startWithLorem && source === 'lorem' && sentences.length > 0) {
      sentences[0] = LOREM_START
    }
    paragraphs = [sentences.join(' ')]
  } else {
    const ws = genWords(words, count)
    if (ws.length > 0) ws[0] = capitalize(ws[0])
    paragraphs = [ws.join(' ') + '.']
  }
  if (asHtml) return paragraphs.map((p) => `<p>${p}</p>`).join('\n')
  return paragraphs.join('\n\n')
}

const SOURCE_ORDER: Source[] = ['lorem', 'hipster', 'pirate', 'bacon']

export function LoremPage() {
  const { t } = useTranslation()
  const [source, setSource] = useState<Source>('lorem')
  const [mode, setMode] = useState<Mode>('paragraphs')
  const [count, setCount] = useState(3)
  const [startWithLorem, setStartWithLorem] = useState(true)
  const [asHtml, setAsHtml] = useState(false)
  const [nonce, setNonce] = useState(0)
  const text = useMemo(() => {
    void nonce
    return generate(source, mode, count, startWithLorem, asHtml)
  }, [source, mode, count, startWithLorem, asHtml, nonce])

  const handleCopy = async () => {
    if (!text) return
    await navigator.clipboard.writeText(text)
    toast.success(t('common.copied'))
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t('tools.lorem.name')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('pages.lorem.description')}</p>
      </header>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex rounded-md border border-input bg-transparent text-sm">
          {(
            [
              ['paragraphs', t('pages.lorem.paragraphs')],
              ['sentences', t('pages.lorem.sentences')],
              ['words', t('pages.lorem.words')],
            ] as [Mode, string][]
          ).map(([m, label]) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1.5 transition-colors ${
                mode === m
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <Label htmlFor="source" className="text-xs text-muted-foreground">
          {t('pages.lorem.source')}
        </Label>
        <select
          id="source"
          value={source}
          onChange={(e) => setSource(e.target.value as Source)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          {SOURCE_ORDER.map((s) => (
            <option key={s} value={s} className="bg-background">
              {t(`pages.lorem.sources.${s}`)}
            </option>
          ))}
        </select>

        <Label htmlFor="count" className="text-xs text-muted-foreground">
          {t('pages.lorem.count')}
        </Label>
        <Input
          id="count"
          type="number"
          min={1}
          max={50}
          value={count}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (n >= 1 && n <= 50) setCount(n)
          }}
          className="w-20 font-mono text-sm"
        />
        <Button size="sm" variant="secondary" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="h-4 w-4" />
          {t('common.regenerate')}
        </Button>
        <Button size="sm" variant="ghost" onClick={handleCopy} disabled={!text} className="ml-auto">
          <Copy className="h-4 w-4" />
          {t('common.copy')}
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={startWithLorem}
            onChange={(e) => setStartWithLorem(e.target.checked)}
            disabled={source !== 'lorem'}
            className="accent-primary"
          />
          <span className={source !== 'lorem' ? 'text-muted-foreground' : ''}>
            {t('pages.lorem.startWithLorem')}
          </span>
        </label>
        <label className="flex cursor-pointer items-center gap-2 select-none">
          <input
            type="checkbox"
            checked={asHtml}
            onChange={(e) => setAsHtml(e.target.checked)}
            className="accent-primary"
          />
          <span>{t('pages.lorem.asHtml')}</span>
        </label>
      </div>

      <Textarea
        value={text}
        readOnly
        spellCheck={false}
        className="min-h-[420px] text-sm leading-relaxed"
      />
    </div>
  )
}
