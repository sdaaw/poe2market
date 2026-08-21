/**
 * Build step: pull the economy once and write it to public/data as static JSON.
 *
 * The data is public, read-only and identical for every visitor, so there is no
 * reason to hit poe.ninja per request. CI runs this on a schedule and publishes
 * the result, which means one upstream fetch per run rather than one per viewer.
 *
 *   node scripts/snapshot.js
 */
import { mkdir, writeFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchIndexedLeagues, fetchSnapshot } from '../server/ninja.js';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const write = (file, data) => writeFile(path.join(OUT, file), JSON.stringify(data), 'utf8');

async function main() {
  await mkdir(OUT, { recursive: true });

  const leagues = await fetchIndexedLeagues();
  console.log(`Indexed leagues: ${leagues.map((l) => l.name).join(', ') || '(none)'}`);

  const written = [];
  for (const league of leagues) {
    process.stdout.write(`  ${league.name} … `);
    const snapshot = await fetchSnapshot(league.id);

    if (!snapshot.items.length && !snapshot.currency.length) {
      console.log('no data, skipped');
      continue;
    }

    const file = `${slug(league.id)}.json`;
    await write(file, snapshot);
    written.push({ id: league.id, name: league.name, file });
    console.log(
      `${snapshot.items.length} uniques, ${snapshot.currency.length} currency -> data/${file}` +
        (snapshot.errors.length ? ` (${snapshot.errors.length} category errors)` : '')
    );
    for (const err of snapshot.errors) console.warn(`      ! ${err}`);
  }

  if (!written.length) throw new Error('No league returned any data — refusing to publish an empty site.');

  await write('leagues.json', { generatedAt: new Date().toISOString(), leagues: written });

  // Drop snapshots for leagues that are no longer indexed.
  const keep = new Set([...written.map((w) => w.file), 'leagues.json']);
  for (const file of await readdir(OUT)) {
    if (file.endsWith('.json') && !keep.has(file)) {
      await unlink(path.join(OUT, file));
      console.log(`  removed stale data/${file}`);
    }
  }

  console.log(`\nDone — ${written.length} league(s) written to public/data.`);
}

main().catch((err) => {
  console.error(`\nSnapshot failed: ${err.message}`);
  process.exit(1);
});
