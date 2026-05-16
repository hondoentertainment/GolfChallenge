import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

type HealthPayload = {
  ok: boolean;
  service: string;
  timestamp: string;
  checks: {
    database_url_configured: boolean;
    database_reachable: boolean;
    cron_secret_configured: boolean;
    cron_required_in_production: boolean;
    jwt_strong_secret_configured: boolean;
    resend_configured: boolean;
  };
  warnings: string[];
};

/** Lightweight readiness probe for monitors and post-deploy checks (no auth). */
export async function GET() {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  const warnings: string[] = [];

  const databaseUrlConfigured = Boolean(process.env.DATABASE_URL);
  let databaseReachable = false;
  if (databaseUrlConfigured) {
    try {
      await queryOne<{ ok: number }>('SELECT 1 as ok');
      databaseReachable = true;
    } catch {
      databaseReachable = false;
    }
  }

  const cronSecretConfigured = Boolean(process.env.CRON_SECRET);
  if (isProduction && !cronSecretConfigured) {
    warnings.push('CRON_SECRET is not set — Vercel cron routes return 503/401 until configured.');
  }

  const devJwtFallback = 'golf-challenge-dev-secret-change-in-prod';
  const jwtStrong =
    Boolean(process.env.JWT_SECRET) && process.env.JWT_SECRET !== devJwtFallback;
  if (isProduction && !jwtStrong) {
    warnings.push('JWT_SECRET should be set to a strong random value in production.');
  }

  const resendConfigured = Boolean(process.env.RESEND_API_KEY);

  const ok = databaseUrlConfigured && databaseReachable;

  const payload: HealthPayload = {
    ok,
    service: 'golf-challenge',
    timestamp: new Date().toISOString(),
    checks: {
      database_url_configured: databaseUrlConfigured,
      database_reachable: databaseReachable,
      cron_secret_configured: cronSecretConfigured,
      cron_required_in_production: isProduction,
      jwt_strong_secret_configured: jwtStrong,
      resend_configured: resendConfigured,
    },
    warnings,
  };

  return NextResponse.json(payload, { status: ok ? 200 : 503 });
}
