import getDb from './db';
import { v4 as uuidv4 } from 'uuid';

// 2025-2026 PGA Tour Season Schedule (current season)
// Excludes: Zurich Classic (team event)
export const PGA_SCHEDULE_2025_2026 = [
  { name: "The Sentry", startDate: "2026-01-02", endDate: "2026-01-05", course: "Kapalua Plantation Course", location: "Maui, HI", purse: 20000000 },
  { name: "Sony Open in Hawaii", startDate: "2026-01-08", endDate: "2026-01-11", course: "Waialae Country Club", location: "Honolulu, HI", purse: 8400000 },
  { name: "The American Express", startDate: "2026-01-15", endDate: "2026-01-18", course: "PGA West", location: "La Quinta, CA", purse: 8400000 },
  { name: "Farmers Insurance Open", startDate: "2026-01-22", endDate: "2026-01-25", course: "Torrey Pines", location: "San Diego, CA", purse: 9600000 },
  { name: "AT&T Pebble Beach Pro-Am", startDate: "2026-01-29", endDate: "2026-02-01", course: "Pebble Beach Golf Links", location: "Pebble Beach, CA", purse: 20000000 },
  { name: "WM Phoenix Open", startDate: "2026-02-05", endDate: "2026-02-08", course: "TPC Scottsdale", location: "Scottsdale, AZ", purse: 9200000 },
  { name: "The Genesis Invitational", startDate: "2026-02-12", endDate: "2026-02-15", course: "Riviera Country Club", location: "Pacific Palisades, CA", purse: 20000000 },
  { name: "Mexico Open at VidantaWorld", startDate: "2026-02-19", endDate: "2026-02-22", course: "VidantaWorld", location: "Vallarta, Mexico", purse: 8400000 },
  { name: "Cognizant Classic", startDate: "2026-02-26", endDate: "2026-03-01", course: "PGA National", location: "Palm Beach Gardens, FL", purse: 8400000 },
  { name: "Arnold Palmer Invitational", startDate: "2026-03-05", endDate: "2026-03-08", course: "Bay Hill Club", location: "Orlando, FL", purse: 20000000 },
  { name: "THE PLAYERS Championship", startDate: "2026-03-12", endDate: "2026-03-15", course: "TPC Sawgrass", location: "Ponte Vedra Beach, FL", purse: 25000000 },
  { name: "Valspar Championship", startDate: "2026-03-19", endDate: "2026-03-22", course: "Innisbrook Resort", location: "Palm Harbor, FL", purse: 8400000 },
  { name: "Texas Children's Houston Open", startDate: "2026-03-26", endDate: "2026-03-29", course: "Memorial Park Golf Course", location: "Houston, TX", purse: 9200000 },
  { name: "Valero Texas Open", startDate: "2026-04-02", endDate: "2026-04-05", course: "TPC San Antonio", location: "San Antonio, TX", purse: 8800000 },
  { name: "Masters Tournament", startDate: "2026-04-09", endDate: "2026-04-12", course: "Augusta National Golf Club", location: "Augusta, GA", purse: 20000000 },
  { name: "RBC Heritage", startDate: "2026-04-16", endDate: "2026-04-19", course: "Harbour Town Golf Links", location: "Hilton Head, SC", purse: 20000000 },
  // Zurich Classic EXCLUDED (team event) - would be Apr 23-26
  { name: "THE CJ CUP Byron Nelson", startDate: "2026-04-30", endDate: "2026-05-03", course: "TPC Craig Ranch", location: "McKinney, TX", purse: 9500000 },
  { name: "Wells Fargo Championship", startDate: "2026-05-07", endDate: "2026-05-10", course: "Quail Hollow Club", location: "Charlotte, NC", purse: 20000000 },
  { name: "PGA Championship", startDate: "2026-05-14", endDate: "2026-05-17", course: "Aronimink Golf Club", location: "Newtown Square, PA", purse: 17500000 },
  { name: "Charles Schwab Challenge", startDate: "2026-05-21", endDate: "2026-05-24", course: "Colonial Country Club", location: "Fort Worth, TX", purse: 9200000 },
  { name: "the Memorial Tournament", startDate: "2026-05-28", endDate: "2026-05-31", course: "Muirfield Village Golf Club", location: "Dublin, OH", purse: 20000000 },
  { name: "RBC Canadian Open", startDate: "2026-06-04", endDate: "2026-06-07", course: "Hamilton Golf & Country Club", location: "Hamilton, ON", purse: 9400000 },
  { name: "U.S. Open", startDate: "2026-06-18", endDate: "2026-06-21", course: "Shinnecock Hills", location: "Southampton, NY", purse: 21500000 },
  { name: "Travelers Championship", startDate: "2026-06-25", endDate: "2026-06-28", course: "TPC River Highlands", location: "Cromwell, CT", purse: 20000000 },
  { name: "Rocket Mortgage Classic", startDate: "2026-07-02", endDate: "2026-07-05", course: "Detroit Golf Club", location: "Detroit, MI", purse: 9200000 },
  { name: "John Deere Classic", startDate: "2026-07-09", endDate: "2026-07-12", course: "TPC Deere Run", location: "Silvis, IL", purse: 8200000 },
  { name: "Genesis Scottish Open", startDate: "2026-07-09", endDate: "2026-07-12", course: "The Renaissance Club", location: "North Berwick, Scotland", purse: 9000000 },
  { name: "The Open Championship", startDate: "2026-07-16", endDate: "2026-07-19", course: "Royal Birkdale", location: "Southport, England", purse: 17000000 },
  { name: "3M Open", startDate: "2026-07-23", endDate: "2026-07-26", course: "TPC Twin Cities", location: "Blaine, MN", purse: 8400000 },
  { name: "Wyndham Championship", startDate: "2026-07-30", endDate: "2026-08-02", course: "Sedgefield Country Club", location: "Greensboro, NC", purse: 8400000 },
  { name: "FedEx St. Jude Championship", startDate: "2026-08-06", endDate: "2026-08-09", course: "TPC Southwind", location: "Memphis, TN", purse: 20000000 },
  { name: "BMW Championship", startDate: "2026-08-13", endDate: "2026-08-16", course: "Caves Valley Golf Club", location: "Owings Mills, MD", purse: 20000000 },
  { name: "TOUR Championship", startDate: "2026-08-20", endDate: "2026-08-23", course: "East Lake Golf Club", location: "Atlanta, GA", purse: 100000000 },
];

// Notable PGA golfers for the selection pool
export const PGA_GOLFERS = [
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
  { name: "Si Woo Kim", worldRanking: 31, country: "KOR" },
  { name: "Min Woo Lee", worldRanking: 32, country: "AUS" },
  { name: "Davis Thompson", worldRanking: 33, country: "USA" },
  { name: "Aaron Rai", worldRanking: 34, country: "ENG" },
  { name: "Sepp Straka", worldRanking: 35, country: "AUT" },
  { name: "Jordan Spieth", worldRanking: 36, country: "USA" },
  { name: "Adam Scott", worldRanking: 37, country: "AUS" },
  { name: "Tiger Woods", worldRanking: 38, country: "USA" },
  { name: "Will Zalatoris", worldRanking: 39, country: "USA" },
  { name: "Max Homa", worldRanking: 40, country: "USA" },
  { name: "Dustin Johnson", worldRanking: 41, country: "USA" },
  { name: "Brooks Koepka", worldRanking: 42, country: "USA" },
  { name: "Cameron Smith", worldRanking: 43, country: "AUS" },
  { name: "Jon Rahm", worldRanking: 44, country: "ESP" },
  { name: "Tyrrell Hatton", worldRanking: 45, country: "ENG" },
  { name: "Bryson DeChambeau", worldRanking: 46, country: "USA" },
  { name: "Justin Rose", worldRanking: 47, country: "ENG" },
  { name: "Rickie Fowler", worldRanking: 48, country: "USA" },
  { name: "Taylor Pendrith", worldRanking: 49, country: "CAN" },
  { name: "Maverick McNealy", worldRanking: 50, country: "USA" },
];

export function seedTournaments() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM tournaments').get() as { count: number };
  if (existing.count > 0) return;

  const insert = db.prepare(
    'INSERT INTO tournaments (id, name, start_date, end_date, course, location, purse, season) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const insertMany = db.transaction(() => {
    for (const t of PGA_SCHEDULE_2025_2026) {
      insert.run(uuidv4(), t.name, t.startDate, t.endDate, t.course, t.location, t.purse, '2025-2026');
    }
  });

  insertMany();
}

export function seedGolfers() {
  const db = getDb();
  const existing = db.prepare('SELECT COUNT(*) as count FROM golfers').get() as { count: number };
  if (existing.count > 0) return;

  const insert = db.prepare(
    'INSERT INTO golfers (id, name, world_ranking, country) VALUES (?, ?, ?, ?)'
  );

  const insertMany = db.transaction(() => {
    for (const g of PGA_GOLFERS) {
      insert.run(uuidv4(), g.name, g.worldRanking, g.country);
    }
  });

  insertMany();
}

export function getPickDeadline(pickPosition: number, tournamentStartDate: string): Date {
  // Picks are due on Wednesday before the tournament starts (Thursday)
  const startDate = new Date(tournamentStartDate + 'T00:00:00');
  const wednesday = new Date(startDate);
  // Go back to the Wednesday before the tournament
  const dayOfWeek = startDate.getDay();
  // If tournament starts Thursday (4), Wednesday is 1 day before
  // We want the Wednesday before or on the start date
  const daysBack = dayOfWeek >= 3 ? dayOfWeek - 3 : dayOfWeek + 4;
  wednesday.setDate(startDate.getDate() - daysBack);

  // Player 1 (position 0): 6pm PDT (Wed 18:00 PDT = Thu 01:00 UTC)
  // Player 2 (position 1): 8pm PDT (Wed 20:00 PDT = Thu 03:00 UTC)
  // Additional players get 2 hours each after
  const baseHourUTC = 1; // 6pm PDT = 1am UTC next day
  const hourOffset = pickPosition * 2;

  const deadline = new Date(wednesday);
  deadline.setDate(deadline.getDate() + 1); // next day for UTC
  deadline.setUTCHours(baseHourUTC + hourOffset, 0, 0, 0);

  return deadline;
}

// Get the pick deadline in a display-friendly format
export function getPickDeadlineDisplay(pickPosition: number): string {
  const baseHour = 18; // 6pm
  const hour = baseHour + (pickPosition * 2);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : hour;
  return `Wednesday ${displayHour}:00 ${period} PDT`;
}
