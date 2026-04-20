import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import { listJobs, runJob } from '@/lib/jobs';
import { logAction } from '@/lib/audit';

// GET: list all runnable jobs
export async function GET() {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (!user?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }
  return NextResponse.json({ jobs: listJobs() });
}

// POST: run a job by name
export async function POST(req: NextRequest) {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (!user?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { name } = await req.json();
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const result = await runJob(name);
  await logAction('admin_run_job', `${name}: ${result.summary} (${result.durationMs}ms)`, undefined, user.id);

  return NextResponse.json(result);
}
