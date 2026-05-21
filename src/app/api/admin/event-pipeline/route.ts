import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';
import { getTournaments } from '@/lib/picks';
import { getEventPipelineState, runEventPipelineStage, type EventPipelineStageId } from '@/lib/event-update-pipeline';
import { logAction } from '@/lib/audit';

export async function GET(req: NextRequest) {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (!user?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const tournamentId = new URL(req.url).searchParams.get('tournamentId');
  if (!tournamentId) {
    const tournaments = await getTournaments();
    return NextResponse.json({ tournaments });
  }

  try {
    const pipeline = await getEventPipelineState(tournamentId);
    return NextResponse.json({ pipeline });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load pipeline' },
      { status: 400 },
    );
  }
}

export async function POST(req: NextRequest) {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (!user?.is_admin) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const tournamentId = body.tournamentId as string | undefined;
  const stageId = body.stageId as EventPipelineStageId | undefined;

  if (!tournamentId || !stageId) {
    return NextResponse.json({ error: 'tournamentId and stageId required' }, { status: 400 });
  }

  const before = await getEventPipelineState(tournamentId);
  const stageBefore = before.stages.find((s) => s.id === stageId);
  if (!stageBefore) {
    return NextResponse.json({ error: 'Unknown stage' }, { status: 400 });
  }
  if (stageBefore.status === 'locked' || stageBefore.status === 'blocked') {
    return NextResponse.json(
      {
        ok: false,
        summary:
          stageBefore.status === 'locked'
            ? 'Stage is locked until the event is in the right phase.'
            : 'Complete earlier domino stages before running this one.',
        pipeline: before,
      },
      { status: 409 },
    );
  }
  if (!stageBefore.runnable) {
    return NextResponse.json(
      { ok: false, summary: 'This stage is not runnable.', pipeline: before },
      { status: 409 },
    );
  }

  const start = Date.now();
  const result = await runEventPipelineStage(tournamentId, stageId);
  const durationMs = Date.now() - start;
  await logAction(
    'admin_event_pipeline',
    `${stageId} @ ${before.tournament.name}: ${result.summary} (${durationMs}ms)`,
    undefined,
    user.id,
  );

  const pipeline = await getEventPipelineState(tournamentId);
  return NextResponse.json({ ...result, durationMs, pipeline });
}
