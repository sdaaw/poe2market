/**
 * Long-run price history, accumulated one build at a time.
 *
 * poe.ninja hands us a seven-point sparkline and nothing older, so the only way
 * to get a league-length record is to keep our own. Every scheduled build writes
 * today's prices here and CI commits the result, which makes the repository the
 * store — there is no database, and there cannot be a per-visitor one, since a
 * new reader has to arrive to a chart that is already populated.
 *
 * One point per item per UTC day. Runs during the day overwrite that day's entry,
 * so each value settles as a daily close. Series are arrays positionally aligned
 * to `dates`, which costs far less than repeating a timestamp on every point.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Keep a league's worth of days, then start dropping the oldest. */
const MAX_DAYS = 180;

/** Four significant figures — well past the precision the source data carries. */
function round(n) {
  if (!Number.isFinite(n) || n === 0) return 0;
  const mag = Math.ceil(Math.log10(Math.abs(n)));
  const factor = 10 ** (4 - mag);
  return Math.round(n * factor) / factor;
}

const today = () => new Date().toISOString().slice(0, 10);

const emptyHistory = (league) => ({
  league,
  updatedAt: null,
  dates: [],
  rates: { exalted: [], chaos: [] },
  items: {},
  mechanics: {}
});

async function load(file, league) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    if (parsed?.dates && parsed?.items) return parsed;
  } catch {
    // No history yet, or it is unreadable — start fresh rather than fail the build.
  }
  return emptyHistory(league);
}

/** Grows every series to `length`, padding gaps with null. */
function pad(series, length) {
  while (series.length < length) series.push(null);
  return series;
}

/** Per-mechanic aggregates, so trend charts don't have to re-derive them client-side. */
function mechanicStats(currency) {
  const groups = new Map();
  for (const line of currency) {
    if (!line.mechanic || line.mechanic === 'Currency') continue;
    if (!groups.has(line.mechanic)) groups.set(line.mechanic, []);
    groups.get(line.mechanic).push(line);
  }

  const stats = {};
  for (const [mechanic, lines] of groups) {
    const turnover = lines.reduce((sum, l) => sum + (l.volumeDivine ?? 0), 0);
    const top = Math.max(0, ...lines.map((l) => l.volumeDivine ?? 0));
    stats[mechanic] = {
      turnover: round(turnover),
      topShare: turnover > 0 ? round(top / turnover) : 0
    };
  }
  return stats;
}

/**
 * Folds one snapshot into the league's history file and writes it back.
 * Returns a short summary for the build log.
 */
export async function updateHistory(snapshot, dir, slug) {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${slug}.json`);
  const history = await load(file, snapshot.league);

  const day = today();
  let index = history.dates.indexOf(day);
  const isNewDay = index === -1;
  if (isNewDay) {
    history.dates.push(day);
    index = history.dates.length - 1;
  }
  const length = history.dates.length;

  // Every series has to reach the current day before we can write into it.
  pad(history.rates.exalted, length);
  pad(history.rates.chaos, length);
  history.rates.exalted[index] = round(snapshot.rates?.exalted ?? 0);
  history.rates.chaos[index] = round(snapshot.rates?.chaos ?? 0);

  const seen = new Set();
  for (const entry of [...snapshot.items, ...snapshot.currency]) {
    const key = entry.key;
    if (!key) continue;
    seen.add(key);
    if (!history.items[key]) history.items[key] = [];
    pad(history.items[key], length);
    history.items[key][index] = round(entry.divine ?? 0);
  }
  // Items that vanished from the feed keep their past but record no value today.
  for (const [key, series] of Object.entries(history.items)) {
    pad(series, length);
    if (!seen.has(key)) series[index] = null;
  }

  const stats = mechanicStats(snapshot.currency);
  for (const [mechanic, value] of Object.entries(stats)) {
    if (!history.mechanics[mechanic]) history.mechanics[mechanic] = { turnover: [], topShare: [] };
    const m = history.mechanics[mechanic];
    pad(m.turnover, length);
    pad(m.topShare, length);
    m.turnover[index] = value.turnover;
    m.topShare[index] = value.topShare;
  }
  for (const m of Object.values(history.mechanics)) {
    pad(m.turnover, length);
    pad(m.topShare, length);
  }

  trim(history);

  // Drop series that are entirely empty after trimming, so retired items don't
  // accumulate as dead weight forever.
  for (const [key, series] of Object.entries(history.items)) {
    if (series.every((v) => v === null)) delete history.items[key];
  }

  history.updatedAt = new Date().toISOString();
  await writeFile(file, JSON.stringify(history), 'utf8');

  return {
    file: `${slug}.json`,
    days: history.dates.length,
    series: Object.keys(history.items).length,
    isNewDay,
    since: history.dates[0]
  };
}

function trim(history) {
  const excess = history.dates.length - MAX_DAYS;
  if (excess <= 0) return;
  const cut = (arr) => arr.splice(0, excess);
  cut(history.dates);
  cut(history.rates.exalted);
  cut(history.rates.chaos);
  for (const series of Object.values(history.items)) cut(series);
  for (const m of Object.values(history.mechanics)) {
    cut(m.turnover);
    cut(m.topShare);
  }
}
