import { CHALLENGE_PUBLISHED_GOLFER_ALIASES } from './challenge-published-payouts-2026';

/** Map lowercase ESPN / media spellings → DB golfer id (canonical name must exist in `golfers`). */
export function buildEspnGolferIdLookup(
  golfers: readonly { id: string; name: string }[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const g of golfers) {
    m.set(g.name.trim().toLowerCase(), g.id);
  }
  for (const [alias, canonical] of Object.entries(CHALLENGE_PUBLISHED_GOLFER_ALIASES)) {
    const id = m.get(canonical.trim().toLowerCase());
    if (id) {
      m.set(alias.trim().toLowerCase(), id);
    }
  }
  return m;
}

export function resolveGolferIdFromEspnDisplayName(
  displayName: string,
  lookup: Map<string, string>,
): string | undefined {
  const key = displayName.trim().toLowerCase();
  if (!key) return undefined;
  return lookup.get(key);
}
