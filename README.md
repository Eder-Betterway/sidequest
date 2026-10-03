# Sidequest

A shared trip planner for two, built to live on your phones.

Put in loose dates, regions, must-do milestones (a wedding, a show), how you're getting around (down to your campervan's height and range), and what you're into. Sidequest drafts three different takes on the trip. Pick one, then dial the whole trip or a single day toward chill or packed, dig into each place (history, highlights, sunset and closing times, what's on), and fold in what locals tell you along the way. It syncs between both phones and keeps working with no signal.

## Status

Being built in small steps, each one a pull request you can test on your phone before it goes live:

0. Scaffold: installable app shell that opens offline, CI, docs
1. Sign in and shared trips
2. Trip inputs, 3 options, day plan
3. Vibe dials and re-planning
4. Place deep-dives
5. Local tips into the plan
6. Campervan smarts
7. Offline and install polish

## Docs

- [docs/SETUP.md](docs/SETUP.md): one-time setup (Vercel, Firebase, API keys, repo settings)
- [docs/CO-BUILDING.md](docs/CO-BUILDING.md): how to suggest, build, test, and merge changes, mostly from your phone
- [CLAUDE.md](CLAUDE.md): conventions every Claude Code session follows

## Run it locally

```
npm ci
cp .env.example .env.local   # fill in what you have
npm run dev
```

`npm run check` runs lint, typecheck, unit tests, and a production build. `npm run test:e2e` runs the phone-size browser tests.
