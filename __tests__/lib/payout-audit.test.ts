import { auditPayouts, PayoutEntry, AuditContext } from '@/lib/payout-audit';
import { auditMastersResults } from '@/lib/masters-results';

const BASE_CTX: AuditContext = {
  tournamentName: 'Masters Tournament',
  purse: 22500000,
  missedCutPayout: 25000,
};

describe('auditPayouts', () => {
  test('approves a well-formed minimal dataset', () => {
    const entries: PayoutEntry[] = [
      { name: 'Rory McIlroy', position: '1', score: '-12', prizeMoney: 4500000 },
      { name: 'Scottie Scheffler', position: '2', score: '-11', prizeMoney: 2430000 },
      { name: 'Byeong Hun An', position: 'MC', score: '', prizeMoney: 25000 },
    ];
    const result = auditPayouts(entries, BASE_CTX);
    expect(result.approved).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('rejects unknown golfer names', () => {
    const entries: PayoutEntry[] = [
      { name: 'Not A Real Golfer', position: '1', score: '-5', prizeMoney: 100 },
    ];
    const result = auditPayouts(entries, BASE_CTX);
    expect(result.approved).toBe(false);
    expect(result.errors.some(e => e.includes('Unknown golfer'))).toBe(true);
  });

  test('rejects known non-participants', () => {
    const entries: PayoutEntry[] = [
      { name: 'Tiger Woods', position: 'T5', score: '-5', prizeMoney: 900000 },
    ];
    const ctx: AuditContext = { ...BASE_CTX, knownNonParticipants: ['Tiger Woods'] };
    const result = auditPayouts(entries, ctx);
    expect(result.approved).toBe(false);
    expect(result.errors.some(e => e.includes('Non-participant'))).toBe(true);
  });

  test('rejects duplicate entries', () => {
    const entries: PayoutEntry[] = [
      { name: 'Rory McIlroy', position: '1', score: '-12', prizeMoney: 4500000 },
      { name: 'Rory McIlroy', position: '2', score: '-11', prizeMoney: 2430000 },
    ];
    const result = auditPayouts(entries, BASE_CTX);
    expect(result.approved).toBe(false);
    expect(result.errors.some(e => e.includes('Duplicate'))).toBe(true);
  });

  test('rejects missed-cut players earning more than cut payout', () => {
    const entries: PayoutEntry[] = [
      { name: 'Rory McIlroy', position: 'MC', score: '', prizeMoney: 100000 },
    ];
    const result = auditPayouts(entries, BASE_CTX);
    expect(result.approved).toBe(false);
    expect(result.errors.some(e => e.includes('should earn'))).toBe(true);
  });

  test('rejects finishing players with $0', () => {
    const entries: PayoutEntry[] = [
      { name: 'Rory McIlroy', position: '1', score: '-12', prizeMoney: 0 },
    ];
    const result = auditPayouts(entries, BASE_CTX);
    expect(result.approved).toBe(false);
    expect(result.errors.some(e => e.includes('$0'))).toBe(true);
  });

  test('rejects invalid position format', () => {
    const entries: PayoutEntry[] = [
      { name: 'Rory McIlroy', position: 'FIRST', score: '-12', prizeMoney: 4500000 },
    ];
    const result = auditPayouts(entries, BASE_CTX);
    expect(result.approved).toBe(false);
    expect(result.errors.some(e => e.includes('Invalid position'))).toBe(true);
  });

  test('rejects mismatched prize among tied players', () => {
    const entries: PayoutEntry[] = [
      { name: 'Rory McIlroy', position: 'T3', score: '-10', prizeMoney: 1080000 },
      { name: 'Scottie Scheffler', position: 'T3', score: '-10', prizeMoney: 1000000 },
    ];
    const result = auditPayouts(entries, BASE_CTX);
    expect(result.approved).toBe(false);
    expect(result.errors.some(e => e.includes('Tied group'))).toBe(true);
  });
});

describe('auditMastersResults', () => {
  test('Masters 2026 results pass the audit before being published', () => {
    const result = auditMastersResults();
    if (!result.approved) {
      console.error('Masters audit errors:', result.errors);
    }
    expect(result.approved).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('Masters audit warnings are acceptable', () => {
    const result = auditMastersResults();
    // Warnings are allowed (table-calc drift on Masters' published per-player
    // figures is expected for tied groups). Cap at 30 so genuine schema
    // problems still surface but normal Masters tie-math passes through.
    expect(result.warnings.length).toBeLessThanOrEqual(30);
  });

  test('Masters purse allocation is within bounds', () => {
    const result = auditMastersResults();
    expect(result.summary.totalDistributed).toBeLessThanOrEqual(22500000 * 1.01);
  });
});
