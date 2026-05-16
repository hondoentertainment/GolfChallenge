/** How `tournament_results.prize_money` was last set (audit / admin clarity). */
export const PRIZE_SOURCE_TIE_TABLE = 'tie_table';
export const PRIZE_SOURCE_PUBLISHED_MEDIA = 'published_media';
export const PRIZE_SOURCE_MANUAL = 'manual';
export const PRIZE_SOURCE_SEED = 'seed';

export type PrizeMoneySource =
  | typeof PRIZE_SOURCE_TIE_TABLE
  | typeof PRIZE_SOURCE_PUBLISHED_MEDIA
  | typeof PRIZE_SOURCE_MANUAL
  | typeof PRIZE_SOURCE_SEED;
