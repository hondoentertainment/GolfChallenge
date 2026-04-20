import { queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';
import { auditPayouts, PayoutEntry, AuditContext } from './payout-audit';

// 2026 RBC Heritage final results (Harbour Town Golf Links, April 16-19).
// Signature Event: $20M purse, 80-player field, no cut — everyone gets paid.
// Matt Fitzpatrick defeated Scottie Scheffler in a playoff.
// Sources: PGA Tour, CBS Sports, Golf Channel, ESPN (verified April 19, 2026).
const RBC_HERITAGE_2026_RESULTS: PayoutEntry[] = [
  { name: "Matt Fitzpatrick", position: "1", score: "-18", prizeMoney: 3600000 },
  { name: "Scottie Scheffler", position: "2", score: "-18", prizeMoney: 2160000 },
  { name: "Si Woo Kim", position: "3", score: "-16", prizeMoney: 1360000 },
  { name: "Collin Morikawa", position: "T4", score: "-13", prizeMoney: 823333 },
  { name: "Harris English", position: "T4", score: "-13", prizeMoney: 823333 },
  { name: "Ludvig Åberg", position: "T4", score: "-13", prizeMoney: 823333 },
  { name: "Xander Schauffele", position: "T12", score: "-10", prizeMoney: 455000 },
  { name: "Sahith Theegala", position: "T25", score: "-7", prizeMoney: 175000 },
  { name: "Viktor Hovland", position: "T42", score: "-3", prizeMoney: 55300 },
];

const RBC_HERITAGE_NON_PARTICIPANTS: string[] = [
  "Rory McIlroy",
];

const RBC_HERITAGE_AUDIT_CTX: AuditContext = {
  tournamentName: "RBC Heritage",
  purse: 20000000,
  knownNonParticipants: RBC_HERITAGE_NON_PARTICIPANTS,
};

export function auditRBCHeritageResults() {
  return auditPayouts(RBC_HERITAGE_2026_RESULTS, RBC_HERITAGE_AUDIT_CTX);
}

export async function seedRBCHeritageResults() {
  const audit = auditRBCHeritageResults();
  if (!audit.approved) {
    console.error('[rbc-heritage-results] AUDIT FAILED — refusing to publish payouts:');
    for (const err of audit.errors) console.error(`  ✗ ${err}`);
    return;
  }
  if (audit.warnings.length > 0) {
    console.warn('[rbc-heritage-results] Audit warnings:');
    for (const w of audit.warnings) console.warn(`  ! ${w}`);
  }

  const tournament = await queryOne<{ id: string }>(
    `SELECT id FROM tournaments WHERE name = 'RBC Heritage' AND season = '2025-2026'`
  );
  if (!tournament) return;

  await execute(`UPDATE tournaments SET status = 'completed' WHERE id = $1`, [tournament.id]);

  for (const name of RBC_HERITAGE_NON_PARTICIPANTS) {
    await execute(
      `DELETE FROM tournament_results
       WHERE tournament_id = $1
         AND golfer_id IN (SELECT id FROM golfers WHERE name = $2)`,
      [tournament.id, name]
    );
  }

  for (const r of RBC_HERITAGE_2026_RESULTS) {
    const golfer = await queryOne<{ id: string }>(
      `SELECT id FROM golfers WHERE name = $1`,
      [r.name]
    );
    if (!golfer) continue;

    await execute(
      `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, score)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(tournament_id, golfer_id) DO UPDATE SET
         position = EXCLUDED.position,
         prize_money = EXCLUDED.prize_money,
         score = EXCLUDED.score`,
      [uuidv4(), tournament.id, golfer.id, r.position, r.prizeMoney, r.score]
    );
  }
}
