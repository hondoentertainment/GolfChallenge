import { calculatePrizeMoney } from './pga-schedule';
import { seedEventResultsIfPastEndAndEmpty, type SeededResultRow } from './seed-event-results';

const SEASON = '2025-2026';
const PURSE_20M = 20_000_000;

// Illustrative leaderboards for standard $20M events (not the audited Masters/RBC seeds).
// Seeding runs only after the tournament `end_date` is in the past—see seedEventResultsIfPastEndAndEmpty.

const SCORE_LADDER_50 = [
  '-16',
  '-15',
  '-15',
  '-14',
  '-14',
  '-13',
  '-13',
  '-12',
  '-12',
  '-11',
  '-10',
  '-10',
  '-9',
  '-8',
  '-8',
  '-7',
  '-7',
  '-6',
  '-6',
  '-5',
  '-4',
  '-4',
  '-3',
  '-3',
  '-2',
  '-2',
  '-1',
  '-1',
  'E',
  'E',
  '+1',
  '+1',
  '+2',
  '+2',
  '+3',
  '+3',
  '+4',
  '+4',
  '+5',
  '+5',
  '+6',
  '+6',
  '+7',
  '+7',
  '+8',
  '+8',
  '+9',
  '+10',
  '+10',
  '+11',
] as const;

const CADILLAC_2026_NAMES = [
  'Scottie Scheffler',
  'Rory McIlroy',
  'Ludvig Åberg',
  'Will Zalatoris',
  'Jason Day',
  'Keegan Bradley',
  'Maverick McNealy',
  'Rickie Fowler',
  'Tom McKibbin',
  'Taylor Pendrith',
  'Stephan Jaeger',
  'Nick Dunlap',
  'Jake Knapp',
  'Brendon Todd',
  'Cam Davis',
  'Patrick Rodgers',
  'Lucas Glover',
  'Webb Simpson',
  'Gary Woodland',
  'Andrew Putnam',
  'C.T. Pan',
  'Kevin Yu',
  'Adam Hadwin',
  'Matt Kuchar',
  'Thomas Detry',
  'Peter Malnati',
  'Chez Reavie',
  'Zach Johnson',
  'Patton Kizzire',
  'Ben Martin',
  'Chesson Hadley',
  'Ryan Fox',
  'Joseph Bramlett',
  'S.H. Kim',
  'Nate Lashley',
  'Matthieu Pavon',
  'Daniel Berger',
  'Jhonattan Vegas',
  'Greyson Sigg',
  'Matt NeSmith',
  'Dylan Wu',
  'Ryan Palmer',
  'Garrick Higgo',
  'Chan Kim',
  'Jimmy Walker',
  'J.J. Spaun',
  'Chris Gotterup',
  'Ryo Hisatsune',
  'K.H. Lee',
  'Brendan Steele',
] as const;

const TRUIST_2026_NAMES = [
  'Collin Morikawa',
  'Xander Schauffele',
  'Viktor Hovland',
  'Patrick Cantlay',
  'Sam Burns',
  'Tony Finau',
  'Hideki Matsuyama',
  'Tommy Fleetwood',
  'Shane Lowry',
  'Russell Henley',
  'Brian Harman',
  'Sungjae Im',
  'Matt Fitzpatrick',
  'Jordan Spieth',
  'Max Homa',
  'Tom Kim',
  'Justin Thomas',
  'Cameron Young',
  'Wyndham Clark',
  'Sahith Theegala',
  'Corey Conners',
  'Denny McCarthy',
  'Min Woo Lee',
  'Si Woo Kim',
  'Billy Horschel',
  'Akshay Bhatia',
  'Robert MacIntyre',
  'Tyrrell Hatton',
  'Justin Rose',
  'Adam Scott',
  'Harris English',
  'Eric Cole',
  'Austin Eckroat',
  'Keith Mitchell',
  'Alex Noren',
  'Beau Hossler',
  'Mackenzie Hughes',
  'Nick Taylor',
  'Christiaan Bezuidenhout',
  'J.T. Poston',
  'Taylor Moore',
  'Luke List',
  'Kevin Kisner',
  'Joel Dahmen',
  'Davis Thompson',
  'Aaron Rai',
  'Tom Hoge',
  'Byeong Hun An',
  'Sepp Straka',
  'Harry Hall',
] as const;

function buildStandardRows(names: readonly string[]): SeededResultRow[] {
  return names.map((name, i) => {
    const place = i + 1;
    return {
      name,
      position: String(place),
      score: SCORE_LADDER_50[i]!,
      prizeMoney: calculatePrizeMoney(PURSE_20M, place),
    };
  });
}

export async function seedCadillacChampionshipResults() {
  await seedEventResultsIfPastEndAndEmpty('Cadillac Championship', SEASON, buildStandardRows(CADILLAC_2026_NAMES));
}

export async function seedTruistChampionshipResults() {
  await seedEventResultsIfPastEndAndEmpty('Truist Championship', SEASON, buildStandardRows(TRUIST_2026_NAMES));
}

/** Illustrative seeds for tour events after audited Masters/RBC (date-gated). */
export async function seedIllustrativeTourResultsAfterRbc() {
  await seedCadillacChampionshipResults();
  await seedTruistChampionshipResults();
}
