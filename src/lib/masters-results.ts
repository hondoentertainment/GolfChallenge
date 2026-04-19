import { queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';
import { auditPayouts, PayoutEntry, AuditContext } from './payout-audit';

// 2026 Masters Tournament final results. Purse: $22.5M. Cut: +4 (148).
// 54 players made the cut from a 91-player field.
// Rory McIlroy won his second consecutive green jacket.
// Sources verified: PGA Tour, CBS Sports, SI, Golf Channel, Heavy Sports,
// ESPN, Yahoo Sports, NBC Sports, Bleacher Report, Golf.com (April 2026).
//
// Strategy: verified positions + comprehensive MC list. Mid-pack positions
// (T18-T50) that couldn't be triangulated with confidence are omitted from
// this seed — the ESPN historical fetch from event 401811941 populates them
// at runtime. Audit-approved rows are never overwritten by ESPN.
//
// Non-participants: Tiger Woods (health), Phil Mickelson (withdrew Apr 2),
// Tom Kim (did not qualify), Sahith Theegala (did not qualify).
const MASTERS_2026_RESULTS: PayoutEntry[] = [
  // === VERIFIED MADE-CUT POSITIONS ===
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
  { name: "Hideki Matsuyama", position: "T12", score: "-5", prizeMoney: 427500 },
  { name: "Patrick Cantlay", position: "T12", score: "-5", prizeMoney: 427500 },
  { name: "Jordan Spieth", position: "T12", score: "-5", prizeMoney: 427500 },
  { name: "Jason Day", position: "T12", score: "-5", prizeMoney: 427500 },
  { name: "Tommy Fleetwood", position: "T33", score: "E", prizeMoney: 121500 },
  { name: "Dustin Johnson", position: "T33", score: "E", prizeMoney: 121500 },

  // === MISSED CUT ($25,000 each for professionals) ===
  // Cut line: +4 (148). 37 players missed including 6 amateurs (who earn $0).
  // Only listing professionals in our golfer roster who missed the cut.
  { name: "Bryson DeChambeau", position: "MC", score: "+6", prizeMoney: 25000 },
  { name: "Akshay Bhatia", position: "MC", score: "+6", prizeMoney: 25000 },
  { name: "J.J. Spaun", position: "MC", score: "+5", prizeMoney: 25000 },
  { name: "Bubba Watson", position: "MC", score: "+5", prizeMoney: 25000 },
  { name: "Robert MacIntyre", position: "MC", score: "+7", prizeMoney: 25000 },
  { name: "Cameron Smith", position: "MC", score: "+7", prizeMoney: 25000 },
  { name: "Min Woo Lee", position: "MC", score: "+11", prizeMoney: 25000 },
  { name: "Nicolai H\u00f8jgaard", position: "MC", score: "", prizeMoney: 25000 },
  { name: "Byeong Hun An", position: "MC", score: "", prizeMoney: 25000 },
  { name: "Zach Johnson", position: "MC", score: "+6", prizeMoney: 25000 },
  { name: "Fred Couples", position: "MC", score: "+9", prizeMoney: 25000 },
];

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

  // Clean up stale result rows for non-participants and previously
  // incorrect entries. Audit-clean set overrides; remaining stale rows
  // get cleared so ESPN historical can repopulate correctly.
  const currentNames = new Set(MASTERS_2026_RESULTS.map(r => r.name));
  const allPossiblyStale = [
    ...MASTERS_2026_NON_PARTICIPANTS,
    "Shane Lowry", "Tony Finau", "Brian Harman", "Adam Scott",
    "Justin Thomas", "Corey Conners", "Keegan Bradley", "Brooks Koepka",
    "Wyndham Clark", "Sepp Straka", "Will Zalatoris", "Rickie Fowler",
    "Billy Horschel", "Patrick Reed", "Sergio Garcia",
    "Joaquin Niemann", "Chris Kirk", "Charl Schwartzel",
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
