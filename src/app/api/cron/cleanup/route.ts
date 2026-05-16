import { verifyCronAuth } from '@/lib/cron-auth';
import { NextRequest, NextResponse } from 'next/server';
import { execute } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

// Runs Sunday 3am UTC - cleanup expired sessions and password resets
export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  await ensureSeeded();
  try {
    await execute('DELETE FROM password_resets WHERE expires_at < NOW() OR used = TRUE');
    await execute("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days'");
    return NextResponse.json({ message: 'Cleanup complete' });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
