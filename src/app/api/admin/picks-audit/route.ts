import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { auditAllPickValues } from '@/lib/picks';
import { ensureSeeded } from '@/lib/seed';

/** GET: full pick-value audit (tie-table vs DB, missing/zero issues) — admin only. */
export async function GET() {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const report = await auditAllPickValues();
    return NextResponse.json(report);
  } catch {
    return NextResponse.json({ error: 'Failed to run picks audit' }, { status: 500 });
  }
}
