@AGENTS.md

# Sidequest

A shared trip planner for two people, used mostly on phones and often with no signal. Every Claude Code session on this repo (local, cloud, or the @claude GitHub Action) follows these rules.

## Commands

- `npm ci`: install
- `npm run dev`: local dev server at http://localhost:3000 (no service worker in dev)
- `npm run check`: lint, typecheck, unit tests, build. **Must pass before you open a PR.** The build must pass with no env vars set.
- `npm run test:e2e`: Playwright on a production build at phone size (Pixel 7). In Claude Code cloud sessions it uses the Chromium at `/opt/pw-browsers/chromium`; never run `playwright install` there.
- `node scripts/make-icons.mjs`: regenerate PNG icons after editing `public/icon.svg`

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind 4 (configured in `app/globals.css`; there is no tailwind.config). Firebase (Firestore + Auth) for shared data, Claude API for AI, Vercel for hosting. Next 16 differs from older versions: read `node_modules/next/dist/docs/` before using an API you're unsure of.

## Structure

- `app/page.tsx`: the only page. The app is one client-rendered shell (`components/shell/AppShell.tsx`) so one cached page works offline. Add views as components, not routes.
- `app/api/`: the only place server secrets are read. Every route checks the signed-in user first.
- `lib/ai/models.ts`: every Claude model ID. `lib/ai/prompts/`: every prompt, one file per feature.
- `lib/data/`: every Firestore read and write. Components never call Firestore directly.
- `lib/plan/`: pure planning logic (vibe dials, applying proposals, validation). Keep it pure and unit tested.
- `lib/grounding/`: real-world facts (sun times, weather, Wikipedia, hours, routing, campsites).
- `public/sw.js`: the service worker. `tests/unit/` (Vitest) and `tests/e2e/` (Playwright).

## Rules

- **Phone first.** Design for a 375px-wide screen, 44px minimum tap targets, thumb-reachable actions. Check iOS Safari and Android Chrome.
- **Offline safe.** Never block the screen waiting on the network. Firestore writes are fire-and-forget (they only resolve once the server confirms). No Firestore transactions; use batch writes. Show "waiting to sync" for unsynced changes. AI buttons say "needs signal" when offline instead of failing.
- **AI never edits the plan directly.** Anything that changes an existing plan comes back as a proposal the user accepts or skips. Locked items never move.
- **Facts come from sources, not the model.** Opening hours, sun times, and weather come from `lib/grounding/`. Anything else the AI says is labeled "AI suggestion, unverified" unless it carries a source link.
- **Secrets.** Only `NEXT_PUBLIC_*` values may reach the browser. Never commit `.env*` files or keys. New env vars go in `.env.example` and `docs/SETUP.md`.
- **This repo is public.** No trip dates, addresses, booking numbers, or personal names in code, fixtures, issues, or PRs. Use made-up sample trips in tests.
- **Small PRs.** One change per PR. Fill in the PR template, including how to test it on a phone. Add or update tests with every logic change.
- **Writing style** for docs and app text: plain, warm, short. No em-dashes.
- Don't edit `.github/workflows/` or delete user data unless the issue asks for it.
