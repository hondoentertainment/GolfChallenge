# Ops runbook (payouts & earnings)

Concise guide for npm scripts that touch tournament prizes and standings. All assume repo root and `.env.local` with `DATABASE_URL` (see `.env.example`).

## `npm run full-payout-repair`

Use when results or dollar amounts are broadly wrong or you want a single end-to-end fix: historical ESPN refresh for completed events, tie-table math, pick reconciliation, transcribed published payouts overlay, final reconcile, and badges. Also appropriate when audits suggest deep drift or after unusual manual DB edits.

## `npm run audit-published-payouts`

Run **before** trusting media-aligned dollars. Compares the database to transcribed Sports Illustrated / Golf.com / GNN payout tables for completed events. If it fails (`missingInDb`, mismatches), fix data or purses first (`npm run sync-schedule-purses` if schedule purses in code changed), then apply reconciliation below—or run **full-payout-repair** instead.

## `npm run apply-published-media-sync-reconcile`

Use after audits pass (or when intentionally aligning to published tables): sync purses from schedule, apply transcribed published payouts, reconcile picks, refresh badges—**without** recomputing every finisher’s prize from pure tie-table math alone.

## Do **not** run `npm run recalc-earnings` right after media apply

`recalc-earnings` (`recalculate-participant-earnings.ts`) syncs purses and recomputes `tournament_results.prize_money` from the mathematical tie table. That **overwrites** dollars that came from transcribed published payouts. After `apply-published-media-sync-reconcile`, running `recalc-earnings` discards those aligned amounts; you would need to run the media pipeline again if you still want published-table dollars.

Use `recalc-earnings` when you intentionally want tie-table-derived prizes everywhere (for example full ESPN refresh workflows), not immediately after media reconciliation.

## Database indexes (`initializeDb`)

`initializeDb` in `src/lib/db.ts` runs `CREATE TABLE IF NOT EXISTS` plus **`CREATE INDEX IF NOT EXISTS`** for: `idx_league_members_league`, `idx_picks_league`, `idx_picks_league_tournament`, `idx_picks_league_user`, `idx_picks_user`, `idx_messages_league`, `idx_notifications_user`, `idx_tournament_results_tournament`, `idx_audit_log_league`, `idx_badges_user`. Application startup paths that call `initializeDb` ensure these exist alongside additive column migrations.

## `scripts/local/`

Personal or machine-specific scripts belong here; Git ignores everything under `scripts/local/` except `.gitkeep` and `README.md` so ad hoc files are not committed by default.

## `GET /api/health`

Readiness probe (no auth): confirms `DATABASE_URL` is set and the DB answers `SELECT 1`. Response includes non-secret booleans for `CRON_SECRET`, `JWT_SECRET` strength, `ADMIN_EMAIL`, and `RESEND_API_KEY`, plus `warnings` in production when required env is missing. Use after deploy or in uptime checks; do not log response bodies if they might appear in public dashboards.

## Admin event pipeline (`/admin/event-pipeline`)

Gated, domino-ordered updates **per tournament**: schedule → ESPN leaderboard → global reconcile → tie table + transcribed media + badges → automatic sign-off (includes published payout audit when a table exists). The API returns `409` if a stage is run out of order. Implementation: `src/lib/event-update-pipeline.ts`, API `GET/POST /api/admin/event-pipeline`.