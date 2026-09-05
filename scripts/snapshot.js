/**
 * Build step: pull both economies once and write them to public/data as static JSON.
 *
 * The data is public, read-only and identical for every visitor, so there is no
 * reason to hit poe.ninja per request. CI runs this on a schedule and publishes
 * the result, which means one upstream fetch per run rather than one per viewer.
 *
 *   node scripts/snapshot.js            both realms
 *   node scripts/snapshot.js poe1       just one
 */
import { mkdir, writeFile, readFile, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchIndexedLeagues, fetchSnapshot } from '../server/ninja.js';
import { REALMS } from '../server/realms.js';
import { updateHistory } from './history.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'data');
// Unlike public/data, this is committed: it is the only thing that survives
// between CI runs, and therefore the only place long-run history can live.
const HISTORY = path.join(ROOT, 'public', 'history');

const slug = (name) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const write = (file, data) => writeFile(path.join(OUT, file), JSON.stringify(data), 'utf8');

const kb = (value) => `${Math.round(JSON.stringify(value).length / 1024)} KB`;

/**
 * Modifier text is over a third of a snapshot and nothing on the landing page
 * needs it, so it ships as a separate file the browser fetches in the background.
 * Halves what a reader downloads before seeing anything.
 */
const MOD_FIELDS = [
  'explicit', 'implicit', 'granted', 'properties',
  'requirements', 'flavour', 'randomised', 'mutated'
];

function splitMods(snapshot) {
  const mods = {};
  const items = snapshot.items.map((item) => {
    const carried = {};
    const core = { ...item };
    for (const field of MOD_FIELDS) {
      const value = item[field];
      if (Array.isArray(value) ? value.length : value) carried[field] = value;
      delete core[field];
    }
    if (Object.keys(carried).length) mods[item.key] = carried;
    return core;
  });
  return { core: { ...snapshot, items }, mods };
}

async function buildRealm(realmId) {
  const cfg = REALMS[realmId];
  const leagues = await fetchIndexedLeagues(realmId);
  console.log(`\n${cfg.game}`);
  console.log(`  leagues: ${leagues.map((l) => l.name).join(', ') || '(none)'}`);

  const written = [];
  for (const league of leagues) {
    process.stdout.write(`  ${league.name} … `);
    const snapshot = await fetchSnapshot(realmId, league.id);

    if (!snapshot.items.length && !snapshot.currency.length) {
      console.log('no data, skipped');
      continue;
    }

    const id = `${realmId}-${slug(league.id)}`;
    const file = `${id}.json`;
    const modFile = `${id}-mods.json`;

    const { core, mods } = splitMods(snapshot);
    await write(file, core);
    await write(modFile, mods);

    // History records prices, which live in the core half.
    //
    // Skipped while a league is still priced in Exalted. Its first divine rate
    // rebases every number by a factor of hundreds, and a series spanning that
    // switch would draw a 99% crash on the day the league merely grew up. Those
    // opening days are worth little anyway — near-nothing is listed yet.
    const priced = snapshot.priceUnit === 'div';
    if (!priced) process.stdout.write(`priced in ${snapshot.priceUnit}, no history yet … `);
    const hist = priced ? await updateHistory(snapshot, HISTORY, id) : null;
    written.push({
      realm: realmId,
      realmLabel: cfg.label,
      game: cfg.game,
      id: league.id,
      name: league.name,
      file,
      mods: modFile,
      history: hist?.file ?? null
    });

    console.log(
      `${snapshot.items.length} items, ${snapshot.currency.length} currency -> ` +
        `data/${file} (${kb(core)}) + data/${modFile} (${kb(mods)})`
    );
    if (hist) {
      console.log(
        `      history: ${hist.days} day(s) since ${hist.since}, ${hist.series} series` +
          (hist.isNewDay ? ' (new day)' : ' (today updated)')
      );
    }
    for (const err of snapshot.errors) console.warn(`      ! ${err}`);
  }
  return written;
}

async function main() {
  await mkdir(OUT, { recursive: true });

  const only = process.argv[2];
  const realmIds = only ? [only] : Object.keys(REALMS);
  if (only && !REALMS[only]) throw new Error(`Unknown realm "${only}". Try: ${Object.keys(REALMS).join(', ')}`);

  const written = [];
  for (const realmId of realmIds) written.push(...(await buildRealm(realmId)));

  if (!written.length) throw new Error('No league returned any data — refusing to publish an empty site.');

  // A single-realm run must not evict the other realm from the index, or the
  // site would lose a game it still has perfectly good data files for.
  let carried = [];
  if (only) {
    try {
      const existing = JSON.parse(await readFile(path.join(OUT, 'leagues.json'), 'utf8'));
      carried = (existing.leagues ?? []).filter((l) => l.realm !== only);
    } catch {
      // No previous index; nothing to carry.
    }
  }

  const leagues = [...written, ...carried];
  const present = new Set(leagues.map((l) => l.realm));

  await write('leagues.json', {
    generatedAt: new Date().toISOString(),
    realms: Object.values(REALMS)
      .filter((r) => present.has(r.id))
      .map((r) => ({ id: r.id, label: r.label, game: r.game })),
    leagues
  });

  // Drop snapshots for leagues that are no longer indexed. Only prunes realms we
  // actually rebuilt, so a single-realm run cannot delete the other's data.
  const keep = new Set([...written.flatMap((w) => [w.file, w.mods]), 'leagues.json']);
  for (const file of await readdir(OUT)) {
    if (!file.endsWith('.json') || keep.has(file)) continue;
    if (only && !file.startsWith(`${only}-`)) continue;
    await unlink(path.join(OUT, file));
    console.log(`  removed stale data/${file}`);
  }

  console.log(`\nDone — ${written.length} league(s) across ${realmIds.length} realm(s).`);
}

main().catch((err) => {
  console.error(`\nSnapshot failed: ${err.message}`);
  process.exit(1);
});
