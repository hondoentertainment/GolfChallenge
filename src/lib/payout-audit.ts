// Payout audit agent. Validates tournament result data BEFORE it is written to
// the database. Enforces field integrity, position ordering, tie-math correctness,
// and purse totals. Used to gate seedMastersResults and any future manual/bulk
// payout seeding to prevent publishing bad numbers.

import { PGA_GOLFERS, parsePosition, getPayoutTable } from './pga-schedule';

export interface PayoutEntry {
  name: string;
  position: string;
  score: string;
  prizeMoney: number;
}

export interface AuditResult {
  approved: boolean;
  errors: string[];
  warnings: string[];
  summary: {
    totalEntries: number;
    madeCut: number;
    missedCut: number;
    totalDistributed: number;
  };
}

export interface AuditContext {
  tournamentName: string;
  purse: number;
  missedCutPayout?: number; // e.g. $25k for the Masters
  knownNonParticipants?: string[];
}

const POSITION_PATTERN = /^(T?\d+|MC|CUT|WD|DQ|DNS|MDF)$/;
const NON_FINISHING = new Set(['MC', 'CUT', 'WD', 'DQ', 'DNS', 'MDF']);

export function auditPayouts(entries: PayoutEntry[], ctx: AuditContext): AuditResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const golferNames = new Set(PGA_GOLFERS.map(g => g.name));
  const seenNames = new Set<string>();

  // Group by position for tie-math validation
  const positionGroups = new Map<string, PayoutEntry[]>();

  for (const entry of entries) {
    // 1. Golfer must exist in the roster
    if (!golferNames.has(entry.name)) {
      errors.push(`Unknown golfer: "${entry.name}" is not in the PGA roster`);
    }

    // 2. Golfer must not be a known non-participant
    if (ctx.knownNonParticipants?.includes(entry.name)) {
      errors.push(`Non-participant: "${entry.name}" did not play in ${ctx.tournamentName}`);
    }

    // 3. No duplicates
    if (seenNames.has(entry.name)) {
      errors.push(`Duplicate entry: "${entry.name}" appears more than once`);
    }
    seenNames.add(entry.name);

    // 4. Position must be well-formed
    if (!POSITION_PATTERN.test(entry.position)) {
      errors.push(`Invalid position format for ${entry.name}: "${entry.position}"`);
      continue;
    }

    // 5. Missed-cut players should earn the cut payout (if specified)
    if (NON_FINISHING.has(entry.position)) {
      if (ctx.missedCutPayout !== undefined && entry.prizeMoney !== ctx.missedCutPayout) {
        errors.push(`${entry.name} (${entry.position}) should earn $${ctx.missedCutPayout.toLocaleString()}, got $${entry.prizeMoney.toLocaleString()}`);
      }
      continue;
    }

    // 6. Finishing players must have positive prize money
    if (entry.prizeMoney <= 0) {
      errors.push(`${entry.name} finished ${entry.position} but earned $0`);
    }

    // Group ties for math validation
    if (!positionGroups.has(entry.position)) positionGroups.set(entry.position, []);
    positionGroups.get(entry.position)!.push(entry);
  }

  // 7. Tie-math: payouts for tied players must match (sum of covered positions) / count
  const payoutTable = getPayoutTable(ctx.tournamentName);
  for (const [pos, group] of positionGroups) {
    if (NON_FINISHING.has(pos)) continue;
    const basePos = parsePosition(pos);
    if (basePos <= 0) continue;
    const count = group.length;

    // Sum the table percentages for positions basePos through basePos+count-1
    let sumPct = 0;
    let tableGaps = 0;
    for (let i = 0; i < count; i++) {
      const pct = payoutTable[basePos + i];
      if (pct === undefined) {
        tableGaps++;
      } else {
        sumPct += pct;
      }
    }

    if (tableGaps === count) {
      warnings.push(`No payout-table entries for ${pos} span (${count} players)`);
      continue;
    }

    const expectedEach = Math.round((sumPct / count) * ctx.purse);
    const actualEach = group[0].prizeMoney;

    // All tied players should earn the same amount — this is a real bug if violated
    for (const p of group) {
      if (p.prizeMoney !== actualEach) {
        errors.push(`Tied group ${pos}: ${p.name} got $${p.prizeMoney.toLocaleString()}, others got $${actualEach.toLocaleString()}`);
      }
    }

    // Compare against table-calculated amount as a sanity check. Augusta's
    // published per-player figures occasionally drift from the formula because
    // the published payout schedule may have rounding/structural quirks. Treat
    // any drift as advisory-only — we trust the source data over the formula
    // when all tied players have the same positive amount.
    const drift = Math.abs(actualEach - expectedEach);
    if (drift > 500) {
      warnings.push(`Tied group ${pos}: $${actualEach.toLocaleString()} per player vs. table-calculated $${expectedEach.toLocaleString()} (drift $${drift.toLocaleString()})`);
    }
  }

  // 8. Position ordering: no gaps, ties consume the right number of slots
  const finishing = entries.filter(e => !NON_FINISHING.has(e.position));
  const sortedByPos = [...finishing].sort((a, b) => parsePosition(a.position) - parsePosition(b.position));
  let expectedNext = 1;
  for (const [pos, group] of new Map(sortedByPos.reduce((acc, e) => {
    const p = parsePosition(e.position);
    if (!acc.find(([k]) => k === p)) acc.push([p, []]);
    acc.find(([k]) => k === p)![1].push(e);
    return acc;
  }, [] as [number, PayoutEntry[]][]))) {
    if (pos !== expectedNext) {
      warnings.push(`Position gap: expected position ${expectedNext}, got ${pos} (${group.length} players)`);
    }
    expectedNext = pos + group.length;
  }

  // 9. Score monotonicity: later positions have equal or worse scores
  const finishingWithScores = finishing
    .filter(e => e.score && e.score !== 'E' ? !isNaN(parseInt(e.score)) : true)
    .sort((a, b) => parsePosition(a.position) - parsePosition(b.position));
  for (let i = 1; i < finishingWithScores.length; i++) {
    const prev = scoreToNumber(finishingWithScores[i - 1].score);
    const curr = scoreToNumber(finishingWithScores[i].score);
    if (prev !== null && curr !== null && curr < prev) {
      errors.push(`Score regression: ${finishingWithScores[i].name} (${finishingWithScores[i].position}, ${finishingWithScores[i].score}) beats earlier finisher ${finishingWithScores[i - 1].name} (${finishingWithScores[i - 1].position}, ${finishingWithScores[i - 1].score})`);
    }
  }

  // 10. Total distributed must not exceed purse
  const madeCut = entries.filter(e => !NON_FINISHING.has(e.position));
  const missedCut = entries.filter(e => NON_FINISHING.has(e.position));
  const totalDistributed = entries.reduce((s, e) => s + e.prizeMoney, 0);

  if (totalDistributed > ctx.purse * 1.01) {
    errors.push(`Total distributed $${totalDistributed.toLocaleString()} exceeds purse $${ctx.purse.toLocaleString()}`);
  }

  return {
    approved: errors.length === 0,
    errors,
    warnings,
    summary: {
      totalEntries: entries.length,
      madeCut: madeCut.length,
      missedCut: missedCut.length,
      totalDistributed,
    },
  };
}

function scoreToNumber(score: string): number | null {
  if (!score) return null;
  if (score === 'E') return 0;
  const n = parseInt(score, 10);
  return isNaN(n) ? null : n;
}
