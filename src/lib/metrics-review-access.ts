/** Default reviewer when `METRICS_REVIEW_ALLOWED_EMAILS` is unset. */
const DEFAULT_REVIEWER_EMAIL = 'hondo4185@gmail.com';

export function getMetricsReviewAllowlist(): string[] {
  const raw = process.env.METRICS_REVIEW_ALLOWED_EMAILS?.trim();
  if (!raw) return [DEFAULT_REVIEWER_EMAIL.toLowerCase()];
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function canAccessMetricsReview(user: { email: string; is_admin: boolean } | null): boolean {
  if (!user?.is_admin) return false;
  return getMetricsReviewAllowlist().includes(user.email.toLowerCase());
}
