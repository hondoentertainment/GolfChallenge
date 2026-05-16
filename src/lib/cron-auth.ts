import { NextRequest, NextResponse } from 'next/server';

// Shared cron authentication check. In production, rejects requests
// if CRON_SECRET is not configured. In development, allows unauthenticated.
export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';

  if (isProduction && !secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured — cron endpoints are disabled in production' },
      { status: 503 }
    );
  }

  if (secret && req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}
