import { NextRequest, NextResponse } from 'next/server';
import { finalizeRecentTournaments } from '@/lib/pga-data';
import { ensureSeeded } from '@/lib/seed';

// Runs Monday 6am UTC — catches any tournament that ended over the weekend
// and ensures all player picks have their payouts captured.
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await ensureSeeded();
  try {
    const result = await finalizeRecentTournaments();
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
