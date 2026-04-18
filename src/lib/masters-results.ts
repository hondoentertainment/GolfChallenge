import { queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';
import { auditPayouts, PayoutEntry, AuditContext } from './payout-audit';

// 2026 Masters Tournament final results. Purse: $22.5M.
// Rory McIlroy won his second consecutive green jacket, defeating Scheffler by one shot.
// Sources verified April 12 2026: PGA Tour, CBS Sports, SI, Golf Channel, Heavy Sports, ESPN, Yahoo Sports.
// Notable non-participants: Tiger Woods (health), Phil Mickelson (withdrew April 2),
// Tom Kim and Sahith Theegala (did not qualify).
// Notable missed cuts: DeChambeau (+6), Watson (+5), Cameron Smith, Bhatia, Spaun, MacIntyre, Byeong Hun An.
// Only entries verified against published payout tables. Players beyond T33
// that couldn't be triangulated with confidence are left off this list — the
// ESPN sync + reconcile-on-view pipeline will fill them in at runtime rather
// than us publishing unaudited numbers.
const MASTERS_2026_RESULTS: PayoutEntry[] = [
  { name: "Rory McIlroy", position: "1", score: "-12", prizeMoney: 4500000 },
  { name: "Scottie Scheffler", position: "2", score: "-11", prizeMoney: 2430000 },
  { name: "Tyrrell Hatton", position: "T3", score: "-10", prizeMoney: 1080000 },
  { name: "Russell Henley", position: "T3", score: "-10", prizeMoney: 1080000 },
  { name: "Justin Rose", position: "T3", score: "-10", prizeMoney: 1080000 },
  { name: "Cameron Young", position: "T3", score: "-10", prizeMoney: 1080000 },
  { name: "Collin Morikawa", position: "T7", score: "-9", prizeMoney: 725625 },
  { name: "Sam Burns", position: "T7", score: "-9", prizeMoney: 725625 },
  { name: "Max Homa", position: "T9", score: "-8", prizeMoney: 630000 },
  { name: "Xander Schauffele", position: "T9", score: "-8", prizeMoney: 630000 },
  { name: "Jake Knapp", position: "11", score: "-7", prizeMoney: 562500 },
  // T12: per-player payout $427,500 (consistent with published figures)
  { name: "Hideki Matsuyama", position: "T12", score: "-5", prizeMoney: 427500 },
  { name: "Patrick Cantlay", position: "T12", score: "-5", prizeMoney: 427500 },
  { name: "Jordan Spieth", position: "T12", score: "-5", prizeMoney: 427500 },
  { name: "Jason Day", position: "T12", score: "-5", prizeMoney: 427500 },
  // T33 verified
  { name: "Tommy Fleetwood", position: "T33", score: "E", prizeMoney: 121500 },
  { name: "Dustin Johnson", position: "T33", score: "E", prizeMoney: 121500 },
  // Missed cut ($25,000 each) — all confirmed
  { name: "Bryson DeChambeau", position: "MC", score: "+6", prizeMoney: 25000 },
  { name: "Bubba Watson", position: "MC", score: "+5", prizeMoney: 25000 },
  { name: "Cameron Smith", position: "MC", score: "", prizeMoney: 25000 },
  { name: "Akshay Bhatia", position: "MC", score: "", prizeMoney: 25000 },
  { name: "J.J. Spaun", position: "MC", score: "", prizeMoney: 25000 },
  { name: "Robert MacIntyre", position: "MC", score: "", prizeMoney: 25000 },
  { name: "Byeong Hun An", position: "MC", score: "", prizeMoney: 25000 },
];

// Golfers who were NOT in the 2026 Masters field — remove any stale result rows
// created by prior seeds so their picks don't show incorrect winnings.
const MASTERS_2026_NON_PARTICIPANTS: string[] = [
  "Tiger Woods",
  "Phil Mickelson",
  "Tom Kim",
  "Sahith Theegala",
];

const MASTERS_AUDIT_CTX: AuditContext = {
  tournamentName: "Masters Tournament",
  purse: 22500000,
  missedCutPayout: 25000,
  knownNonParticipants: MASTERS_2026_NON_PARTICIPANTS,
};

// Audit gate: the seed function will refuse to publish numbers that fail the audit.
export function auditMastersResults() {
  return auditPayouts(MASTERS_2026_RESULTS, MASTERS_AUDIT_CTX);
}

export async function seedMastersResults() {
  const audit = auditMastersResults();
  if (!audit.approved) {
    console.error('[masters-results] AUDIT FAILED \u2014 refusing to publish payouts:');
    for (const err of audit.errors) console.error(`  \u2717 ${err}`);
    return;
  }
  if (audit.warnings.length > 0) {
    console.warn('[masters-results] Audit warnings:');
    for (const w of audit.warnings) console.warn(`  ! ${w}`);
  }

  const masters = await queryOne<{ id: string }>(
    `SELECT id FROM tournaments WHERE name = 'Masters Tournament' AND season = '2025-2026'`
  );
  if (!masters) return;

  await execute(`UPDATE tournaments SET status = 'completed' WHERE id = $1`, [masters.id]);

  // Clean up stale result rows for golfers who didn't play, and for players
  // whose prior seed positions are now known to be wrong — audit-clean set
  // overrides them, remaining stale rows get cleared so reconcile can refresh.
  const currentNames = new Set(MASTERS_2026_RESULTS.map(r => r.name));
  const allPossiblyStale = [
    ...MASTERS_2026_NON_PARTICIPANTS,
    "Shane Lowry", "Jon Rahm", "Tony Finau", "Brian Harman", "Adam Scott",
    "Justin Thomas", "Corey Conners", "Keegan Bradley", "Brooks Koepka",
    "Wyndham Clark", "Sepp Straka", "Will Zalatoris", "Rickie Fowler",
    "Min Woo Lee", "Billy Horschel", "Patrick Reed", "Sergio Garcia",
    "Joaquin Niemann", "Chris Kirk", "Charl Schwartzel", "Fred Couples",
    "Viktor Hovland", "Sungjae Im", "Ludvig \u00c5berg", "Matt Fitzpatrick",
  ];
  for (const name of allPossiblyStale) {
    if (currentNames.has(name)) continue;
    await execute(
      `DELETE FROM tournament_results
       WHERE tournament_id = $1
         AND golfer_id IN (SELECT id FROM golfers WHERE name = $2)`,
      [masters.id, name]
    );
  }

  for (const r of MASTERS_2026_RESULTS) {
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
      [uuidv4(), masters.id, golfer.id, r.position, r.prizeMoney, r.score]
    );
  }
}
