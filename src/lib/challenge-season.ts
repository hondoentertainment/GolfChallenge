/**
 * One wraparound label in Postgres for the “2026” PGA Challenge: every event in
 * `PGA_SCHEDULE_2025_2026` runs on calendar 2026 (Masters–U.S. Open).
 *
 * Use `CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER` in SQL so payouts, reconcile,
 * and standings ignore any stray tournaments incorrectly tagged with the same
 * season but dated before the challenge window.
 */
export const CHALLENGE_SEASON = '2025-2026';

/** Inclusive lower bound on `tournaments.start_date` for challenge payouts & picks. */
export const CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER = '2026-01-01';
