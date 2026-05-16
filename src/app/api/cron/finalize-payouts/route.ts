import { verifyCronAuth } from '@/lib/cron-auth';
import { NextRequest, NextResponse } from 'next/server';
import { finalizeRecentTournaments } from '@/lib/pga-data';
import { ensureSeeded } from '@/lib/seed';

// After PGA events end (UTC): sync ESPN, finalize payouts, notify leagues.
// Schedules in vercel.json: Sun 23:30; Mon 03:00 & 06:00. Idempotent if already completed.
export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  await ensureSeeded();
  try {
    const result = await finalizeRecentTournaments();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
