/**
 * Long-run price history, fetched only when something actually wants to draw it.
 *
 * The file grows for the whole league, so it is deliberately kept out of the main
 * snapshot: opening the site costs nothing extra, and the history is pulled once,
 * on the first chart, then reused.
 */
import { state } from './store.js';

const cache = new Map(); // league id -> Promise<history | null>

export function loadHistory(league = state.league) {
  if (cache.has(league)) return cache.get(league);

  const entry = state.leagues.find((l) => l.id === league);
  const request = !entry?.history
    ? Promise.resolve(null)
    : fetch(`history/${entry.history}`)
        .then((res) => (res.ok ? res.json() : null))
        .catch(() => null);

  cache.set(league, request);
  return request;
}

/**
 * The recorded series for one item, trimmed to the days it actually has data.
 * Returns null when there is nothing worth drawing yet.
 */
export function seriesFor(history, key, minPoints = 3) {
  const raw = history?.items?.[key];
  if (!raw) return null;

  // Ignore leading days from before this item was tracked.
  const first = raw.findIndex((v) => v !== null);
  if (first === -1) return null;

  const values = raw.slice(first);
  const dates = history.dates.slice(first);
  if (values.filter((v) => v !== null).length < minPoints) return null;

  return { dates, values };
}

export const daysRecorded = (history) => history?.dates?.length ?? 0;
