# Golf Challenge

[![CI](https://github.com/hondoentertainment/GolfChallenge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/hondoentertainment/GolfChallenge/actions/workflows/ci.yml)

Head-to-head PGA Tour pick'em platform. League members each pick one golfer per tournament — that golfer's prize money counts toward the player's season total. Most money at the end of the season wins.

## Stack

- **Next.js 16** (App Router, React 19)
- **Neon Postgres** (serverless via `@neondatabase/serverless`)
- **JWT auth** via `jose` + bcryptjs
- **Tailwind CSS v4**
- **Resend** for email (optional)
- **Vercel cron jobs** for scheduled syncs

## Local development

```bash
npm install
cp .env.example .env.local  # fill in DATABASE_URL, JWT_SECRET, etc.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm start` | Run the built app |
| `npm test` | Jest test suite (99 tests) |
| `npm test -- --coverage` | Generate coverage report into `coverage/` |
| `npm run lint` | ESLint |

## Architecture highlights

- **Audit-gated payout publication** (`src/lib/payout-audit.ts`) — every tournament result must pass invariant checks before being written to the database.
- **Three-layer payout pipeline** — audit-approved seed → ESPN historical fetch → on-view reconcile. No pick ever shows `$0` after the tournament ends.
- **Self-healing reconcile** (`ensurePayoutsReconciled`) — runs on every page view (5-min throttle) and triggers ESPN historical fetches for tournaments with picks but no result rows.
- **Per-tournament finalization** — `finalizeTournamentPayouts` runs sync → reconcile → notify → recalculate badges in one pipeline.
- **Admin jobs dashboard** (`/admin/jobs`) — run any of 8 background jobs on demand.

## Cron jobs

| Job | Schedule | Purpose |
|---|---|---|
| `cleanup` | Sunday 3am UTC | Purge expired sessions and 90+ day notifications |
| `tournament-sync` | Every 2h Thu-Sun | Live ESPN sync during tournament weekends |
| `sync-results` | Sunday 11pm UTC | Weekly final ESPN sync |
| `finalize-payouts` | Monday 6am UTC | Full finalization for tournaments that ended over the weekend |
| `pick-reminders` | Wednesday 4pm UTC | Email/push players who haven't picked yet |
| `weekly-recap` | Monday 12pm UTC | Email league members the week's results |

Cron endpoints require the `CRON_SECRET` env var in production.

## CI

GitHub Actions runs typecheck → lint → test → build → coverage on every push to `main` and every PR.

To make CI **required** before merging:
1. Repo Settings → Branches → Add rule for `main`
2. Check "Require status checks to pass before merging"
3. Search for and select `ci`
4. Save

The badge at the top of this README reflects the latest run on `main`.

## Deployment

Vercel auto-deploys from `main` after every successful CI run (gated via Vercel's GitHub integration).

Required environment variables:

- `DATABASE_URL` — Neon Postgres connection string
- `JWT_SECRET` — for session JWTs
- `CRON_SECRET` — for cron endpoint auth
- `ADMIN_EMAIL` — auto-promoted to admin on registration
- `RESEND_API_KEY` + `FROM_EMAIL` — for outgoing email (optional)
- `NEXT_PUBLIC_APP_URL` — used in invite links and email templates
