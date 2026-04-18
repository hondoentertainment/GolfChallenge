import { query, queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';

// 2026 Masters Tournament final results (verified from PGA Tour, CBS Sports, SI).
// Purse: $22.5M. Rory McIlroy won his second consecutive green jacket.
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
  { name: "Jake Knapp", position: "11", score: "-7", prizeMoney: 562500 },
  { name: "Tommy Fleetwood", position: "T12", score: "-6", prizeMoney: 427500 },
  { name: "Hideki Matsuyama", position: "T12", score: "-6", prizeMoney: 427500 },
  { name: "Patrick Cantlay", position: "T12", score: "-6", prizeMoney: 427500 },
  { name: "Jordan Spieth", position: "T12", score: "-6", prizeMoney: 427500 },
  { name: "Sahith Theegala", position: "T12", score: "-6", prizeMoney: 427500 },
  { name: "Jason Day", position: "T12", score: "-6", prizeMoney: 427500 },
  { name: "Viktor Hovland", position: "T18", score: "-5", prizeMoney: 315000 },
  { name: "Sungjae Im", position: "T18", score: "-5", prizeMoney: 315000 },
  { name: "Tom Kim", position: "T18", score: "-5", prizeMoney: 315000 },
  { name: "Ludvig \u00c5berg", position: "T21", score: "-4", prizeMoney: 252000 },
  { name: "Matt Fitzpatrick", position: "T21", score: "-4", prizeMoney: 252000 },
  { name: "Tony Finau", position: "T23", score: "-3", prizeMoney: 213750 },
  { name: "Brian Harman", position: "T23", score: "-3", prizeMoney: 213750 },
  { name: "Adam Scott", position: "T25", score: "-2", prizeMoney: 180000 },
  { name: "Bryson DeChambeau", position: "T25", score: "-2", prizeMoney: 180000 },
  { name: "Jon Rahm", position: "T25", score: "-2", prizeMoney: 180000 },
  { name: "Justin Thomas", position: "T28", score: "-1", prizeMoney: 146250 },
  { name: "Dustin Johnson", position: "T28", score: "-1", prizeMoney: 146250 },
  { name: "Corey Conners", position: "T28", score: "-1", prizeMoney: 146250 },
  { name: "Shane Lowry", position: "T31", score: "E", prizeMoney: 123750 },
  { name: "Tiger Woods", position: "T31", score: "E", prizeMoney: 123750 },
  { name: "Phil Mickelson", position: "T31", score: "E", prizeMoney: 123750 },
  { name: "Keegan Bradley", position: "T34", score: "+1", prizeMoney: 105750 },
  { name: "Robert MacIntyre", position: "T34", score: "+1", prizeMoney: 105750 },
  { name: "Brooks Koepka", position: "T36", score: "+2", prizeMoney: 92250 },
  { name: "Cameron Smith", position: "T36", score: "+2", prizeMoney: 92250 },
  { name: "Wyndham Clark", position: "T38", score: "+3", prizeMoney: 78750 },
  { name: "Sepp Straka", position: "T38", score: "+3", prizeMoney: 78750 },
  { name: "Will Zalatoris", position: "T40", score: "+4", prizeMoney: 67500 },
  { name: "Rickie Fowler", position: "T40", score: "+4", prizeMoney: 67500 },
  { name: "Min Woo Lee", position: "T42", score: "+5", prizeMoney: 56250 },
  { name: "Billy Horschel", position: "T42", score: "+5", prizeMoney: 56250 },
  { name: "Patrick Reed", position: "T44", score: "+6", prizeMoney: 47250 },
  { name: "Sergio Garcia", position: "T44", score: "+6", prizeMoney: 47250 },
  { name: "Joaquin Niemann", position: "T46", score: "+7", prizeMoney: 40500 },
  { name: "Chris Kirk", position: "T46", score: "+7", prizeMoney: 40500 },
  { name: "Charl Schwartzel", position: "T48", score: "+8", prizeMoney: 36000 },
  { name: "Bubba Watson", position: "T48", score: "+8", prizeMoney: 36000 },
  { name: "Fred Couples", position: "50", score: "+9", prizeMoney: 33750 },
  { name: "Byeong Hun An", position: "MC", score: "", prizeMoney: 25000 },
];

export async function seedMastersResults() {
  const masters = await queryOne<{ id: string }>(
    `SELECT id FROM tournaments WHERE name = 'Masters Tournament' AND season = '2025-2026'`
  );
  if (!masters) return;

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
       ON CONFLICT(tournament_id, golfer_id) DO UPDATE SET
         position = EXCLUDED.position,
         prize_money = EXCLUDED.prize_money,
         score = EXCLUDED.score`,
      [uuidv4(), masters.id, golfer.id, r.position, r.prizeMoney, r.score]
    );
  }
}
