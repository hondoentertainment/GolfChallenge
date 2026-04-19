import { verifyCronAuth } from '@/lib/cron-auth';
import { NextRequest, NextResponse } from 'next/server';
import { finalizeRecentTournaments } from '@/lib/pga-data';
import { ensureSeeded } from '@/lib/seed';

// Runs Monday 6am UTC — catches any tournament that ended over the weekend
// and ensures all player picks have their payouts captured.
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
