# Toolbox Design System — conventions

Stock **shadcn/ui** (new-york style, zinc base) primitives from the `toolbox`
app, built on **Tailwind CSS v4** with a semantic-token theme. Every component
is a real compiled export on `window.Toolbox`. Styling is **token-driven and
dark-first**, so designs read on-brand only if you follow the two rules below.

## Theme & wrapping (do this first)

- **No provider is needed for styling** — components are styled by Tailwind
  classes + CSS-variable tokens that live in `styles.css`.
- **Dark is the app's default look.** The tokens are defined twice in
  `styles.css`: light on `:root`, dark on `.dark`. A design renders **light
  unless an ancestor has `class="dark"`** — so wrap the design root in
  `<div class="dark">` for the signature toolbox appearance; omit it for light.
  Both themes are first-class.
- **Tooltip** needs a `TooltipProvider` ancestor (wrap the app, or the tooltip).
- **Toaster** is a mount-once region: render `<Toaster />` near the root, then
  fire toasts imperatively — `toast.success('Saved')` (import `toast` from
  `'sonner'`, also available as `window.Toolbox.toast`).

## Styling idiom: semantic tokens only

Style with **semantic-token utilities**, never raw palette colors
(`bg-zinc-900`, `#18181b`) — that's what keeps light/dark automatic. The
complete token set, always defined in `styles.css` (`:root` + `.dark`):

```
--background --foreground  --card --card-foreground  --popover --popover-foreground
--primary --primary-foreground  --secondary --secondary-foreground
--muted --muted-foreground  --accent --accent-foreground
--destructive --destructive-foreground  --border --input --ring  --radius
```

Radius scale (from `--radius`, 0.625rem): `rounded-sm | rounded-md | rounded-lg | rounded-xl`.

**Reliability caveat — `styles.css` is a build snapshot:** it contains only the
utility classes the toolbox app actually uses, with no live Tailwind compiler
downstream. So:

1. **Prefer composing the provided components** — they carry their full styling
   internally and always render correctly.
2. For your own layout/surfaces these token utilities are confirmed present:
   `bg-{background,foreground,card,popover,primary,secondary,muted,accent,destructive}`,
   `text-{foreground,background,card-foreground,popover-foreground,primary,primary-foreground,secondary-foreground,muted-foreground,accent-foreground,destructive}`,
   `border`, `border-input`, `border-border`, the `rounded-*` scale, plus the
   common layout utilities the app uses (`flex`, `grid`, `gap-*`, `p-*`, `m-*`,
   `items-*`, `justify-*`, `text-sm`). A **specific size** the app doesn't
   happen to use (`w-80`, `min-h-screen`, any arbitrary `w-[…]`) will NOT be in
   the snapshot — set those with an **inline style** (`style={{ width: 320 }}`).
3. For any token whose utility isn't above (e.g. a *-foreground as a
   background, the ring color, the input fill), use the **CSS variable**:
   `style={{ background: 'var(--card)', color: 'var(--card-foreground)' }}` or
   `className="bg-[var(--card)]"`. The variables never go stale.

Do not invent palette utility classes — if it's not a token utility above or a
standard layout class, use the variable.

## Where the truth lives

Read **`styles.css`** (and the `_ds_bundle.css` it `@import`s) for the full
token + utility set before styling. Per component, read its **`<Name>.d.ts`**
(the prop contract) and **`<Name>.prompt.md`** (usage). Compound components
expose their parts as separate exports on `window.Toolbox` (e.g. `Card` →
`CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`,
`CardFooter`; `Tabs` → `TabsList`, `TabsTrigger`, `TabsContent`).

## Idiomatic example

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button } from 'toolbox'

export default function Example() {
  return (
    <div className="dark" style={{ background: 'var(--background)', color: 'var(--foreground)', minHeight: '100vh' }}>
      <div className="flex items-center justify-center" style={{ padding: 32 }}>
        <Card style={{ width: 320 }}>
          <CardHeader>
            <CardTitle>Deploy</CardTitle>
            <CardDescription>Ship the current build to production.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">All checks passed.</p>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button variant="outline">Cancel</Button>
            <Button>Deploy</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
```
