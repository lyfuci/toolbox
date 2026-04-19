# Toolbox

A small set of personal frontend tools — everything runs in the browser, no backend.

Live: <https://toolbox.seansun.xyz>

## Tools

- **JSON** — format / minify / validate
- **JWT** — decode, sign, verify (planned)
- **Media** — clip & concat audio/video via `ffmpeg.wasm`, all client-side (planned)

## Tech stack

- [Vite 8](https://vite.dev) + [React 19](https://react.dev) + TypeScript
- [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) (new-york style, zinc palette)
- [react-router v7](https://reactrouter.com) (BrowserRouter)
- pnpm 10, Node 22

## Develop

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck    # tsc -b --noEmit
pnpm lint         # eslint .
pnpm build        # tsc -b && vite build → dist/
pnpm preview      # serve dist/ at http://localhost:4173
```

The dev server sets `Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp` so `ffmpeg.wasm` (which needs
`SharedArrayBuffer`) works in dev.

## Adding a new tool

1. Create the page component at `src/pages/<Name>.tsx`.
2. Register the route in `src/app/router.tsx`.
3. Add an entry in `src/lib/tools.ts` — that drives the sidebar nav and home card grid.

## License

[MIT](./LICENSE)
