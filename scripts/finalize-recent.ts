import { finalizeRecentTournaments } from '@/lib/pga-data';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env or export it before running.');
    process.exit(1);
  }

  console.log('Finalizing recent tournaments...');
  const result = await finalizeRecentTournaments();

  if (result.finalized.length === 0) {
    console.log('No pending tournaments to finalize in the last 14 days.');
  } else {
    console.log(`Finalized ${result.finalized.length} tournament(s):`);
    for (const t of result.finalized) {
      console.log(
        `  - ${t.tournamentName}: synced=${t.synced}, ` +
        `reconciled created=${t.reconciled.created}, updated=${t.reconciled.updated}`
      );
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('finalize-recent failed:', err);
    process.exit(1);
  });
