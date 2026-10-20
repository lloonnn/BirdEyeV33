# dashboard/CLAUDE.md

The Bird Eye v33 staff dashboard. Read `AGENTS.md` in this folder, `../docs/decisions.md`, section 7 of `../docs/architecture.md`, and `../docs/api-contract.md` first.

## Stack

- Next.js 16 with React 19, TypeScript, Tailwind CSS 4.
- shadcn/ui in the Vega style (`base-vega` in `components.json`), built on `@base-ui/react`, not Radix. Reason: the APIs differ from most shadcn examples, so check the generated component before using it.
- Recharts for charts, through the shadcn `chart` component in `components/ui/chart.tsx`. Bklit removed. Reason: Recharts is already installed.
- Plain Leaflet for the map, wrapped in one React component. Not installed yet. **Do not use react-leaflet.** Reason: it is Hippocratic-2.1, not OSI, and may conflict with SDP commercial use.
- Next.js 16 has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code, as `AGENTS.md` says.

## Commands

Run from `dashboard/`.

```bash
npm install
npm run dev                  # dev server at http://localhost:3000
npm run build
npm run start                # serve the production build
npm run lint                 # eslint with eslint-config-next
npx shadcn add <component>   # add a shadcn component to components/ui/
```

- Tests: not set up yet.

## Action code

- Viewing needs no code. The first action in a session (verify, not a defect, mark fixed, review answers, approve, edit or reject a work order, reset mock data) asks for the action code once, then remembers the unlock in `sessionStorage` until the tab closes or someone clicks the lock icon.
- The code is the server-only env var `ACTION_CODE`, checked by `app/api/unlock/route.ts`. Never name it `NEXT_PUBLIC_`. Reason: `NEXT_PUBLIC_` values are copied into the browser bundle.
- Locally it is set in `dashboard/.env.local` (ignored by git). On the host it is set in the deployment's environment settings. Never write the value into a tracked file; `.env.example` keeps it empty.
- If `ACTION_CODE` is not set, every action stays locked and the dialog says "Actions are off on this deployment."
- It is a speed bump against stray clicks during a demo, not security. Reason: the backend has no authentication in this build (decision 5), so anyone who can reach the API can still call it directly.

## Rules

- **Map:** load the Leaflet map component with `ssr: false` (`next/dynamic`), and give its container `isolation: isolate`. Reason: Leaflet needs the browser, and dialogs must stay above the map.
- **Map data:** read `GET /defects` for the visible area only. Reason: the map stays fast as the township grows.
- **Dark by default:** set `className="dark"` on `<html>` in `app/layout.tsx`. Reason: shadcn switches theme with the `.dark` class.
- **Status colours:** use the tokens in `app/globals.css`: `--status-high`, `--status-medium`, `--status-low`, `--status-done`, `--status-neutral`, exposed to Tailwind as `status-high` and so on (for example `text-status-high`). Always pair a status colour with a word or icon. Reason: colour alone is not readable for everyone.
- **Tokens:** `app/globals.css` is the source of truth, together with `BirdEyeTheme.kt` in the app. Change both in the same commit.
- **Glass:** only the Overview's floating panels use glass, through one shared `.panel` class with a `.no-glass` fallback that turns blur off. Working pages (Review, Work orders, Coverage, Devices) use solid cards. Reason: blur is recomputed while the map pans and can stutter. The `.panel` and `.no-glass` classes are not in `globals.css` yet.
- No login and no resident page. Both are out of scope.
- No AGPL code, as the root CLAUDE.md says. Licence review of other items is deferred until before any SDP deployment (decision 7).
- Supervisor actions use the endpoints in `../docs/api-contract.md`: verify or reject a defect, approve, edit, reject or finish a work order, and `GET /brief/latest` for the brief.
