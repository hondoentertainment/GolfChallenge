import { query, queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';

// 2026 Masters Tournament final results (confirmed top finishers).
// Source: PGA Tour / CBS Sports / Golf News Net, April 12 2026.
const MASTERS_2026_RESULTS: { name: string; position: string; score: string; prizeMoney: number }[] = [
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
  { name: "Tommy Fleetwood", position: "T11", score: "-7", prizeMoney: 517500 },
  { name: "Hideki Matsuyama", position: "T11", score: "-7", prizeMoney: 517500 },
  { name: "Shane Lowry", position: "T13", score: "-6", prizeMoney: 427500 },
  { name: "Viktor Hovland", position: "T13", score: "-6", prizeMoney: 427500 },
  { name: "Patrick Cantlay", position: "T15", score: "-5", prizeMoney: 382500 },
  { name: "Ludvig Åberg", position: "T15", score: "-5", prizeMoney: 382500 },
  { name: "Jordan Spieth", position: "T17", score: "-4", prizeMoney: 337500 },
  { name: "Sahith Theegala", position: "T17", score: "-4", prizeMoney: 337500 },
  { name: "Sungjae Im", position: "T19", score: "-3", prizeMoney: 281250 },
  { name: "Tom Kim", position: "T19", score: "-3", prizeMoney: 281250 },
  { name: "Matt Fitzpatrick", position: "T19", score: "-3", prizeMoney: 281250 },
  { name: "Jason Day", position: "T19", score: "-3", prizeMoney: 281250 },
  { name: "Tony Finau", position: "T23", score: "-2", prizeMoney: 213750 },
  { name: "Brian Harman", position: "T23", score: "-2", prizeMoney: 213750 },
  { name: "Adam Scott", position: "T25", score: "-1", prizeMoney: 180000 },
  { name: "Bryson DeChambeau", position: "T25", score: "-1", prizeMoney: 180000 },
  { name: "Jon Rahm", position: "T25", score: "-1", prizeMoney: 180000 },
  { name: "Brooks Koepka", position: "T28", score: "E", prizeMoney: 146250 },
  { name: "Justin Thomas", position: "T28", score: "E", prizeMoney: 146250 },
  { name: "Dustin Johnson", position: "T28", score: "E", prizeMoney: 146250 },
  { name: "Tiger Woods", position: "T31", score: "+1", prizeMoney: 123750 },
  { name: "Phil Mickelson", position: "T31", score: "+1", prizeMoney: 123750 },
  { name: "Keegan Bradley", position: "T33", score: "+2", prizeMoney: 108000 },
  { name: "Robert MacIntyre", position: "T33", score: "+2", prizeMoney: 108000 },
  { name: "Cameron Smith", position: "T35", score: "+3", prizeMoney: 92250 },
  { name: "Corey Conners", position: "T35", score: "+3", prizeMoney: 92250 },
  { name: "Wyndham Clark", position: "T37", score: "+4", prizeMoney: 78750 },
  { name: "Sepp Straka", position: "T37", score: "+4", prizeMoney: 78750 },
  { name: "Will Zalatoris", position: "T39", score: "+5", prizeMoney: 67500 },
  { name: "Rickie Fowler", position: "T39", score: "+5", prizeMoney: 67500 },
  { name: "Min Woo Lee", position: "T41", score: "+6", prizeMoney: 56250 },
  { name: "Billy Horschel", position: "T41", score: "+6", prizeMoney: 56250 },
  { name: "Patrick Reed", position: "T43", score: "+7", prizeMoney: 47250 },
  { name: "Sergio Garcia", position: "T43", score: "+7", prizeMoney: 47250 },
  { name: "Joaquin Niemann", position: "T45", score: "+8", prizeMoney: 40500 },
  { name: "Chris Kirk", position: "T45", score: "+8", prizeMoney: 40500 },
  { name: "Charl Schwartzel", position: "T47", score: "+9", prizeMoney: 36000 },
  { name: "Bubba Watson", position: "T47", score: "+9", prizeMoney: 36000 },
  { name: "Fred Couples", position: "49", score: "+10", prizeMoney: 33750 },
  { name: "Byeong Hun An", position: "50", score: "+11", prizeMoney: 32625 },
];

export async function seedMastersResults() {
  const masters = await queryOne<{ id: string }>(
    `SELECT id FROM tournaments WHERE name = 'Masters Tournament' AND season = '2025-2026'`
  );
  if (!masters) return;

  const existingCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM tournament_results WHERE tournament_id = $1`,
    [masters.id]
  );
  if (Number(existingCount?.count) > 0) return;

  // Mark the tournament as completed
  await execute(`UPDATE tournaments SET status = 'completed' WHERE id = $1`, [masters.id]);

  for (const r of MASTERS_2026_RESULTS) {
    const golfer = await queryOne<{ id: string }>(
      `SELECT id FROM golfers WHERE name = $1`,
      [r.name]
    );
    if (!golfer) continue;

    await execute(
      `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, score)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(tournament_id, golfer_id) DO NOTHING`,
      [uuidv4(), masters.id, golfer.id, r.position, r.prizeMoney, r.score]
    );
  }
}
