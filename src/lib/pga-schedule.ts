import { query, execute, queryOne } from './db';
import { v4 as uuidv4 } from 'uuid';

// 2025-2026 PGA Tour Challenge: Masters through U.S. Open
// Excludes: Zurich Classic (team event)
export const PGA_SCHEDULE_2025_2026 = [
  { name: "Masters Tournament", startDate: "2026-04-09", endDate: "2026-04-13", course: "Augusta National Golf Club", location: "Augusta, GA", purse: 22500000 },
  { name: "RBC Heritage", startDate: "2026-04-16", endDate: "2026-04-19", course: "Harbour Town Golf Links", location: "Hilton Head, SC", purse: 20000000 },
  // Zurich Classic EXCLUDED (team event) - Apr 23-26
  { name: "Cadillac Championship", startDate: "2026-04-30", endDate: "2026-05-03", course: "Trump National Doral", location: "Miami, FL", purse: 20000000 },
  { name: "Truist Championship", startDate: "2026-05-07", endDate: "2026-05-10", course: "Quail Hollow Club", location: "Charlotte, NC", purse: 20000000 },
  { name: "PGA Championship", startDate: "2026-05-15", endDate: "2026-05-18", course: "Aronimink Golf Club", location: "Newtown Square, PA", purse: 19000000 },
  { name: "CJ Cup Byron Nelson", startDate: "2026-05-21", endDate: "2026-05-24", course: "TPC Craig Ranch", location: "McKinney, TX", purse: 9500000 },
  { name: "Charles Schwab Challenge", startDate: "2026-05-28", endDate: "2026-05-31", course: "Colonial Country Club", location: "Fort Worth, TX", purse: 9200000 },
  { name: "The Memorial Tournament", startDate: "2026-06-04", endDate: "2026-06-07", course: "Muirfield Village Golf Club", location: "Dublin, OH", purse: 20000000 },
  { name: "RBC Canadian Open", startDate: "2026-06-11", endDate: "2026-06-14", course: "TPC Toronto at Osprey Valley", location: "Caledon, ON", purse: 9800000 },
  { name: "U.S. Open", startDate: "2026-06-18", endDate: "2026-06-21", course: "Shinnecock Hills Golf Club", location: "Southampton, NY", purse: 21500000 },
];

// Standard PGA Tour prize money payout percentages (% of purse)
// Based on standard 2025-2026 PGA Tour payout structure for full-field events
export const PRIZE_PAYOUT_PERCENTAGES: Record<number, number> = {
  1: 0.18,
  2: 0.109,
  3: 0.069,
  4: 0.049,
  5: 0.041,
  6: 0.036,
  7: 0.0335,
  8: 0.031,
  9: 0.029,
  10: 0.027,
  11: 0.025,
  12: 0.023,
  13: 0.021,
  14: 0.019,
  15: 0.018,
  16: 0.017,
  17: 0.016,
  18: 0.015,
  19: 0.014,
  20: 0.013,
  21: 0.012,
  22: 0.0112,
  23: 0.0104,
  24: 0.0096,
  25: 0.0088,
  26: 0.008,
  27: 0.0077,
  28: 0.0074,
  29: 0.0071,
  30: 0.0068,
  31: 0.0065,
  32: 0.0062,
  33: 0.0059,
  34: 0.0057,
  35: 0.0055,
  36: 0.0053,
  37: 0.0051,
  38: 0.0049,
  39: 0.0047,
  40: 0.0045,
  41: 0.0043,
  42: 0.0041,
  43: 0.0039,
  44: 0.0037,
  45: 0.0035,
  46: 0.0033,
  47: 0.0031,
  48: 0.0029,
  49: 0.0027,
  50: 0.0026,
  51: 0.00252,
  52: 0.00244,
  53: 0.00238,
  54: 0.00232,
  55: 0.00228,
  56: 0.00224,
  57: 0.0022,
  58: 0.00216,
  59: 0.00212,
  60: 0.0021,
  65: 0.002,
};

// Calculate prize money for a given finish position
export function calculatePrizeMoney(purse: number, position: number): number {
  if (position <= 0) return 0;
  const pct = PRIZE_PAYOUT_PERCENTAGES[position];
  if (pct) return Math.round(purse * pct);
  // For positions 61-65, interpolate
  if (position <= 65) {
    const pct60 = PRIZE_PAYOUT_PERCENTAGES[60] ?? 0.0021;
    const pct65 = PRIZE_PAYOUT_PERCENTAGES[65] ?? 0.002;
    const frac = (position - 60) / 5;
    return Math.round(purse * (pct60 + frac * (pct65 - pct60)));
  }
  // Missed cut / beyond 65
  return 0;
}

// Precomputed prize payouts for each tournament (positions 1-65)
export function getTournamentPayouts(purse: number): { position: number; prizeMoney: number }[] {
  const payouts: { position: number; prizeMoney: number }[] = [];
  for (let pos = 1; pos <= 65; pos++) {
    const money = calculatePrizeMoney(purse, pos);
    if (money > 0) {
      payouts.push({ position: pos, prizeMoney: money });
    }
  }
  return payouts;
}

// Full PGA Tour player roster
export const PGA_GOLFERS = [
  // Top 10
  { name: "Scottie Scheffler", worldRanking: 1, country: "USA" },
  { name: "Xander Schauffele", worldRanking: 2, country: "USA" },
  { name: "Rory McIlroy", worldRanking: 3, country: "NIR" },
  { name: "Collin Morikawa", worldRanking: 4, country: "USA" },
  { name: "Ludvig Åberg", worldRanking: 5, country: "SWE" },
  { name: "Wyndham Clark", worldRanking: 6, country: "USA" },
  { name: "Viktor Hovland", worldRanking: 7, country: "NOR" },
  { name: "Hideki Matsuyama", worldRanking: 8, country: "JPN" },
  { name: "Tommy Fleetwood", worldRanking: 9, country: "ENG" },
  { name: "Shane Lowry", worldRanking: 10, country: "IRL" },
  // 11-20
  { name: "Sahith Theegala", worldRanking: 11, country: "USA" },
  { name: "Patrick Cantlay", worldRanking: 12, country: "USA" },
  { name: "Tony Finau", worldRanking: 13, country: "USA" },
  { name: "Sungjae Im", worldRanking: 14, country: "KOR" },
  { name: "Russell Henley", worldRanking: 15, country: "USA" },
  { name: "Byeong Hun An", worldRanking: 16, country: "KOR" },
  { name: "Keegan Bradley", worldRanking: 17, country: "USA" },
  { name: "Robert MacIntyre", worldRanking: 18, country: "SCO" },
  { name: "Sam Burns", worldRanking: 19, country: "USA" },
  { name: "Matt Fitzpatrick", worldRanking: 20, country: "ENG" },
  // 21-30
  { name: "Justin Thomas", worldRanking: 21, country: "USA" },
  { name: "Akshay Bhatia", worldRanking: 22, country: "USA" },
  { name: "Brian Harman", worldRanking: 23, country: "USA" },
  { name: "Corey Conners", worldRanking: 24, country: "CAN" },
  { name: "Tom Kim", worldRanking: 25, country: "KOR" },
  { name: "Cameron Young", worldRanking: 26, country: "USA" },
  { name: "Jason Day", worldRanking: 27, country: "AUS" },
  { name: "Chris Kirk", worldRanking: 28, country: "USA" },
  { name: "Denny McCarthy", worldRanking: 29, country: "USA" },
  { name: "Billy Horschel", worldRanking: 30, country: "USA" },
  // 31-40
  { name: "Si Woo Kim", worldRanking: 31, country: "KOR" },
  { name: "Min Woo Lee", worldRanking: 32, country: "AUS" },
  { name: "Davis Thompson", worldRanking: 33, country: "USA" },
  { name: "Aaron Rai", worldRanking: 34, country: "ENG" },
  { name: "Sepp Straka", worldRanking: 35, country: "AUT" },
  { name: "Jordan Spieth", worldRanking: 36, country: "USA" },
  { name: "Adam Scott", worldRanking: 37, country: "AUS" },
  { name: "Will Zalatoris", worldRanking: 38, country: "USA" },
  { name: "Max Homa", worldRanking: 39, country: "USA" },
  { name: "Maverick McNealy", worldRanking: 40, country: "USA" },
  // 41-50
  { name: "Taylor Pendrith", worldRanking: 41, country: "CAN" },
  { name: "Rickie Fowler", worldRanking: 42, country: "USA" },
  { name: "Justin Rose", worldRanking: 43, country: "ENG" },
  { name: "Tyrrell Hatton", worldRanking: 44, country: "ENG" },
  { name: "Tiger Woods", worldRanking: 45, country: "USA" },
  { name: "Dustin Johnson", worldRanking: 46, country: "USA" },
  { name: "Brooks Koepka", worldRanking: 47, country: "USA" },
  { name: "Cameron Smith", worldRanking: 48, country: "AUS" },
  { name: "Jon Rahm", worldRanking: 49, country: "ESP" },
  { name: "Bryson DeChambeau", worldRanking: 50, country: "USA" },
  // 51-75
  { name: "Stephan Jaeger", worldRanking: 51, country: "GER" },
  { name: "Nick Taylor", worldRanking: 52, country: "CAN" },
  { name: "Taylor Moore", worldRanking: 53, country: "USA" },
  { name: "Harris English", worldRanking: 54, country: "USA" },
  { name: "Christiaan Bezuidenhout", worldRanking: 55, country: "RSA" },
  { name: "Luke List", worldRanking: 56, country: "USA" },
  { name: "Eric Cole", worldRanking: 57, country: "USA" },
  { name: "J.T. Poston", worldRanking: 58, country: "USA" },
  { name: "Nick Dunlap", worldRanking: 59, country: "USA" },
  { name: "Tom Hoge", worldRanking: 60, country: "USA" },
  { name: "Austin Eckroat", worldRanking: 61, country: "USA" },
  { name: "Jake Knapp", worldRanking: 62, country: "USA" },
  { name: "Emiliano Grillo", worldRanking: 63, country: "ARG" },
  { name: "Andrew Novak", worldRanking: 64, country: "USA" },
  { name: "Beau Hossler", worldRanking: 65, country: "USA" },
  { name: "Keith Mitchell", worldRanking: 66, country: "USA" },
  { name: "Lee Hodges", worldRanking: 67, country: "USA" },
  { name: "Kurt Kitayama", worldRanking: 68, country: "USA" },
  { name: "Mark Hubbard", worldRanking: 69, country: "USA" },
  { name: "Alex Noren", worldRanking: 70, country: "SWE" },
  { name: "Ben Griffin", worldRanking: 71, country: "USA" },
  { name: "Mackenzie Hughes", worldRanking: 72, country: "CAN" },
  { name: "Nicolai Højgaard", worldRanking: 73, country: "DEN" },
  { name: "Sam Stevens", worldRanking: 74, country: "USA" },
  { name: "Doug Ghim", worldRanking: 75, country: "USA" },
  // 76-100
  { name: "Cam Davis", worldRanking: 76, country: "AUS" },
  { name: "Patrick Rodgers", worldRanking: 77, country: "USA" },
  { name: "Matt Kuchar", worldRanking: 78, country: "USA" },
  { name: "Brendon Todd", worldRanking: 79, country: "USA" },
  { name: "Kevin Yu", worldRanking: 80, country: "TPE" },
  { name: "Brice Garnett", worldRanking: 81, country: "USA" },
  { name: "Adam Hadwin", worldRanking: 82, country: "CAN" },
  { name: "Lucas Glover", worldRanking: 83, country: "USA" },
  { name: "Webb Simpson", worldRanking: 84, country: "USA" },
  { name: "Gary Woodland", worldRanking: 85, country: "USA" },
  { name: "Charley Hoffman", worldRanking: 86, country: "USA" },
  { name: "Andrew Putnam", worldRanking: 87, country: "USA" },
  { name: "C.T. Pan", worldRanking: 88, country: "TPE" },
  { name: "Taylor Montgomery", worldRanking: 89, country: "USA" },
  { name: "Kevin Streelman", worldRanking: 90, country: "USA" },
  { name: "Michael Kim", worldRanking: 91, country: "USA" },
  { name: "Thomas Detry", worldRanking: 92, country: "BEL" },
  { name: "Peter Malnati", worldRanking: 93, country: "USA" },
  { name: "Erik van Rooyen", worldRanking: 94, country: "RSA" },
  { name: "Chez Reavie", worldRanking: 95, country: "USA" },
  { name: "Adam Svensson", worldRanking: 96, country: "CAN" },
  { name: "Zach Johnson", worldRanking: 97, country: "USA" },
  { name: "Patton Kizzire", worldRanking: 98, country: "USA" },
  { name: "Ben Martin", worldRanking: 99, country: "USA" },
  { name: "Joel Dahmen", worldRanking: 100, country: "USA" },
  // 101-125
  { name: "Chesson Hadley", worldRanking: 101, country: "USA" },
  { name: "Joseph Bramlett", worldRanking: 102, country: "USA" },
  { name: "Ryan Fox", worldRanking: 103, country: "NZL" },
  { name: "S.H. Kim", worldRanking: 104, country: "KOR" },
  { name: "Nate Lashley", worldRanking: 105, country: "USA" },
  { name: "Matthieu Pavon", worldRanking: 106, country: "FRA" },
  { name: "Daniel Berger", worldRanking: 107, country: "USA" },
  { name: "Jhonattan Vegas", worldRanking: 108, country: "VEN" },
  { name: "Greyson Sigg", worldRanking: 109, country: "USA" },
  { name: "Matt NeSmith", worldRanking: 110, country: "USA" },
  { name: "Dylan Wu", worldRanking: 111, country: "USA" },
  { name: "Ryan Palmer", worldRanking: 112, country: "USA" },
  { name: "Garrick Higgo", worldRanking: 113, country: "RSA" },
  { name: "Chan Kim", worldRanking: 114, country: "USA" },
  { name: "Jimmy Walker", worldRanking: 115, country: "USA" },
  { name: "J.J. Spaun", worldRanking: 116, country: "USA" },
  { name: "Chris Gotterup", worldRanking: 117, country: "USA" },
  { name: "Ryo Hisatsune", worldRanking: 118, country: "JPN" },
  { name: "K.H. Lee", worldRanking: 119, country: "KOR" },
  { name: "Brendan Steele", worldRanking: 120, country: "USA" },
  { name: "Troy Merritt", worldRanking: 121, country: "USA" },
  { name: "Alex Smalley", worldRanking: 122, country: "USA" },
  { name: "Hayden Springer", worldRanking: 123, country: "USA" },
  { name: "Lanto Griffin", worldRanking: 124, country: "USA" },
  { name: "Adam Schenk", worldRanking: 125, country: "USA" },
  // 126-150
  { name: "Victor Perez", worldRanking: 126, country: "FRA" },
  { name: "David Lipsky", worldRanking: 127, country: "USA" },
  { name: "Henrik Norlander", worldRanking: 128, country: "SWE" },
  { name: "Harry Hall", worldRanking: 129, country: "ENG" },
  { name: "Zac Blair", worldRanking: 130, country: "USA" },
  { name: "Scott Stallings", worldRanking: 131, country: "USA" },
  { name: "Nick Hardy", worldRanking: 132, country: "USA" },
  { name: "Chandler Phillips", worldRanking: 133, country: "USA" },
  { name: "Carson Young", worldRanking: 134, country: "USA" },
  { name: "Will Gordon", worldRanking: 135, country: "USA" },
  { name: "Mac Meissner", worldRanking: 136, country: "USA" },
  { name: "Pierceson Coody", worldRanking: 137, country: "USA" },
  { name: "Parker Coody", worldRanking: 138, country: "USA" },
  { name: "Aldrich Potgieter", worldRanking: 139, country: "RSA" },
  { name: "Kevin Tway", worldRanking: 140, country: "USA" },
  { name: "Robby Shelton", worldRanking: 141, country: "USA" },
  { name: "Martin Laird", worldRanking: 142, country: "SCO" },
  { name: "Vince Whaley", worldRanking: 143, country: "USA" },
  { name: "Michael Thorbjornsen", worldRanking: 144, country: "USA" },
  { name: "Rico Hoey", worldRanking: 145, country: "PHI" },
  { name: "David Skinns", worldRanking: 146, country: "ENG" },
  { name: "Matti Schmid", worldRanking: 147, country: "GER" },
  { name: "Cameron Champ", worldRanking: 148, country: "USA" },
  { name: "Ryan Moore", worldRanking: 149, country: "USA" },
  { name: "Matt Wallace", worldRanking: 150, country: "ENG" },
  // 151-175
  { name: "Stewart Cink", worldRanking: 151, country: "USA" },
  { name: "Francesco Molinari", worldRanking: 152, country: "ITA" },
  { name: "Brian Stuard", worldRanking: 153, country: "USA" },
  { name: "Callum Tarren", worldRanking: 154, country: "ENG" },
  { name: "Sam Ryder", worldRanking: 155, country: "USA" },
  { name: "Kevin Kisner", worldRanking: 156, country: "USA" },
  { name: "Jason Dufner", worldRanking: 157, country: "USA" },
  { name: "Phil Mickelson", worldRanking: 158, country: "USA" },
  { name: "Padraig Harrington", worldRanking: 159, country: "IRL" },
  { name: "Fred Couples", worldRanking: 160, country: "USA" },
  { name: "Davis Riley", worldRanking: 161, country: "USA" },
  { name: "Patrick Fishburn", worldRanking: 162, country: "USA" },
  { name: "Trace Crowe", worldRanking: 163, country: "USA" },
  { name: "Ben Silverman", worldRanking: 164, country: "CAN" },
  { name: "Jacob Bridgeman", worldRanking: 165, country: "USA" },
  { name: "Trey Mullinax", worldRanking: 166, country: "USA" },
  { name: "Sean O'Hair", worldRanking: 167, country: "USA" },
  { name: "Nico Echavarria", worldRanking: 168, country: "COL" },
  { name: "Rafael Campos", worldRanking: 169, country: "PUR" },
  { name: "Sami Valimaki", worldRanking: 170, country: "FIN" },
  { name: "Lucas Herbert", worldRanking: 171, country: "AUS" },
  { name: "Rasmus Højgaard", worldRanking: 172, country: "DEN" },
  { name: "Tom McKibbin", worldRanking: 173, country: "NIR" },
  { name: "Thorbjorn Olesen", worldRanking: 174, country: "DEN" },
  // 175-195 (duplicates removed: Zach Johnson, Sahith Theegala, Wyndham Clark, Christiaan Bezuidenhout)
  { name: "Adrian Meronk", worldRanking: 175, country: "POL" },
  { name: "Joaquin Niemann", worldRanking: 176, country: "CHI" },
  { name: "Abraham Ancer", worldRanking: 177, country: "MEX" },
  { name: "Talor Gooch", worldRanking: 178, country: "USA" },
  { name: "Carlos Ortiz", worldRanking: 179, country: "MEX" },
  { name: "Marc Leishman", worldRanking: 180, country: "AUS" },
  { name: "Charl Schwartzel", worldRanking: 181, country: "RSA" },
  { name: "Louis Oosthuizen", worldRanking: 182, country: "RSA" },
  { name: "Ian Poulter", worldRanking: 183, country: "ENG" },
  { name: "Lee Westwood", worldRanking: 184, country: "ENG" },
  { name: "Sergio Garcia", worldRanking: 185, country: "ESP" },
  { name: "Henrik Stenson", worldRanking: 186, country: "SWE" },
  { name: "Patrick Reed", worldRanking: 187, country: "USA" },
  { name: "Kevin Na", worldRanking: 188, country: "USA" },
  { name: "Matthew Wolff", worldRanking: 189, country: "USA" },
  { name: "Bubba Watson", worldRanking: 190, country: "USA" },
  { name: "Brandt Snedeker", worldRanking: 191, country: "USA" },
  { name: "Sung Kang", worldRanking: 192, country: "KOR" },
  { name: "Doc Redman", worldRanking: 193, country: "USA" },
  { name: "Cameron Tringale", worldRanking: 194, country: "USA" },
  { name: "Seamus Power", worldRanking: 195, country: "IRL" },
];

export async function seedTournaments() {
  const existing = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM tournaments WHERE season = $1', ['2025-2026']);
  const dbCount = Number(existing?.count) || 0;
  const expectedCount = PGA_SCHEDULE_2025_2026.length;

  // If tournament count changed (e.g. schedule expanded), re-seed
  if (dbCount > 0 && dbCount !== expectedCount) {
    // Delete old tournaments that have no picks (safe to re-seed)
    await execute(`
      DELETE FROM tournaments WHERE season = $1 AND id NOT IN (
        SELECT DISTINCT tournament_id FROM picks
      )
    `, ['2025-2026']);
    // Insert any missing tournaments
    for (const t of PGA_SCHEDULE_2025_2026) {
      await execute(
        `INSERT INTO tournaments (id, name, start_date, end_date, course, location, purse, season)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8
         WHERE NOT EXISTS (SELECT 1 FROM tournaments WHERE name = $2 AND season = $8)`,
        [uuidv4(), t.name, t.startDate, t.endDate, t.course, t.location, t.purse, '2025-2026']
      );
    }
  } else if (dbCount === 0) {
    for (const t of PGA_SCHEDULE_2025_2026) {
      await execute(
        'INSERT INTO tournaments (id, name, start_date, end_date, course, location, purse, season) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [uuidv4(), t.name, t.startDate, t.endDate, t.course, t.location, t.purse, '2025-2026']
      );
    }
  }

  // Sync purses for existing tournaments so official purse updates propagate
  // (e.g. Masters 2026 increased to a record $22.5M)
  for (const t of PGA_SCHEDULE_2025_2026) {
    await execute(
      `UPDATE tournaments SET purse = $1 WHERE name = $2 AND season = $3 AND purse <> $1`,
      [t.purse, t.name, '2025-2026']
    );
  }
}

export async function seedGolfers() {
  const existing = await queryOne<{ count: string }>('SELECT COUNT(*) as count FROM golfers');

  if (Number(existing?.count) > 0) {
    // Clean up any duplicate golfer names in the database (keep the one with lowest world_ranking)
    await execute(`
      DELETE FROM golfers WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY name ORDER BY world_ranking ASC) as rn
          FROM golfers
        ) ranked WHERE rn > 1
      )
    `);
    return;
  }

  for (const g of PGA_GOLFERS) {
    await execute(
      'INSERT INTO golfers (id, name, world_ranking, country) VALUES ($1, $2, $3, $4)',
      [uuidv4(), g.name, g.worldRanking, g.country]
    );
  }
}

export function getPickDeadline(pickPosition: number, tournamentStartDate: string): Date {
  // Picks are due on Wednesday before the tournament starts (Thursday)
  const startDate = new Date(tournamentStartDate + 'T00:00:00');
  const wednesday = new Date(startDate);
  const dayOfWeek = startDate.getDay();
  const daysBack = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4;
  wednesday.setDate(startDate.getDate() - daysBack);

  // Player 1 (position 0): 6pm PDT (Wed 18:00 PDT = Thu 01:00 UTC)
  // Player 2 (position 1): 8pm PDT (Wed 20:00 PDT = Thu 03:00 UTC)
  const baseHourUTC = 1;
  const hourOffset = pickPosition * 2;

  const deadline = new Date(wednesday);
  deadline.setDate(deadline.getDate() + 1);
  deadline.setUTCHours(baseHourUTC + hourOffset, 0, 0, 0);

  return deadline;
}

export function getPickDeadlineDisplay(pickPosition: number): string {
  const baseHour = 18;
  const hour = baseHour + (pickPosition * 2);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `Wednesday ${displayHour}:00 ${period} PDT`;
}
