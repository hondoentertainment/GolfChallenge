import { buildEspnGolferIdLookup, resolveGolferIdFromEspnDisplayName } from '@/lib/golfer-name-lookup';

describe('buildEspnGolferIdLookup', () => {
  test('maps canonical DB names', () => {
    const m = buildEspnGolferIdLookup([{ id: 'a', name: 'Collin Morikawa' }]);
    expect(resolveGolferIdFromEspnDisplayName('Collin Morikawa', m)).toBe('a');
  });

  test('maps published alias spellings to same golfer id', () => {
    const m = buildEspnGolferIdLookup([{ id: 'x', name: 'Ludvig Åberg' }]);
    expect(resolveGolferIdFromEspnDisplayName('Ludvig Aberg', m)).toBe('x');
  });
});
