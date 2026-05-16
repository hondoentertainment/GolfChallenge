import { canAccessMetricsReview, getMetricsReviewAllowlist } from '@/lib/metrics-review-access';

const originalEnv = process.env;

describe('metrics-review-access', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.METRICS_REVIEW_ALLOWED_EMAILS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('default allowlist is hondo4185@gmail.com', () => {
    expect(getMetricsReviewAllowlist()).toEqual(['hondo4185@gmail.com']);
  });

  test('METRICS_REVIEW_ALLOWED_EMAILS splits comma list', () => {
    process.env.METRICS_REVIEW_ALLOWED_EMAILS = ' A@x.com , B@y.com ';
    expect(getMetricsReviewAllowlist()).toEqual(['a@x.com', 'b@y.com']);
  });

  test('requires admin', () => {
    expect(canAccessMetricsReview({ email: 'hondo4185@gmail.com', is_admin: false })).toBe(false);
  });

  test('allows admin in default allowlist', () => {
    expect(canAccessMetricsReview({ email: 'Hondo4185@gmail.com', is_admin: true })).toBe(true);
  });

  test('denies admin not in allowlist', () => {
    process.env.METRICS_REVIEW_ALLOWED_EMAILS = 'other@x.com';
    expect(canAccessMetricsReview({ email: 'hondo4185@gmail.com', is_admin: true })).toBe(false);
  });
});
