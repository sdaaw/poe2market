/**
 * What the market did while you were away.
 *
 * Every other view answers "what is true now". This one answers "what changed
 * since you last looked", which nothing else can do without a record of the past —
 * it is the first thing the accumulated history buys us beyond a chart.
 *
 * The reader's last visit lives in localStorage, per league, because prices are
 * per league and being told Standard moved when you play the challenge league is
 * noise. The comparison itself comes from the shared history file, so two people
 * arriving after the same gap see the same numbers.
 */
import { state, items, currency, meaningful } from './store.js';

/**
 * Worth interrupting someone over, for a one-day absence. Longer gaps accumulate
 * ordinary drift, so the bar rises with the square root of the gap — a 20% move
 * overnight is news, the same move spread over a fortnight is not. Without this,
 * a four-day absence reported 585 "movers" in PoE1, which is a list nobody reads.
 */
const DAILY_THRESHOLD = 20;
const thresholdFor = (days) => DAILY_THRESHOLD * Math.sqrt(Math.max(days, 1));

const key = () => `poe2.seen.${state.realm}:${state.league}`;

export const lastSeen = () => localStorage.getItem(key());

export function markSeen(date) {
  if (date) localStorage.setItem(key(), date);
}

/**
 * Movement between the reader's last visit and the newest reading.
 *
 * Returns null when there is nothing honest to say: a first visit has no baseline,
 * and a second visit on the same day has no new reading to compare against.
 */
export function movementSince(history) {
  const dates = history?.dates ?? [];
  if (dates.length < 2) return null;

  const since = lastSeen();
  const latest = dates.length - 1;

  // First visit: record where they came in and show nothing this time.
  if (!since) return { firstVisit: true, latest: dates[latest] };

  const from = dates.indexOf(since);
  if (from === -1 || from >= latest) return null;

  // Currency moves as much as items do, and people care about both.
  const byKey = new Map([...items(), ...currency()].map((e) => [e.key, e]));
  const movers = [];
  const threshold = thresholdFor(latest - from);

  for (const [id, series] of Object.entries(history.items ?? {})) {
    const before = series[from];
    const now = series[latest];
    if (before == null || now == null || before <= 0) continue;

    const entry = byKey.get(id);
    // The same liquidity guard the movers list uses: a thin market can post any
    // percentage it likes and mean none of it.
    if (!entry || !meaningful(entry)) continue;

    const change = (now / before - 1) * 100;
    if (Math.abs(change) < threshold) continue;

    movers.push({ entry, before, now, change });
  }

  movers.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  return {
    firstVisit: false,
    since: dates[from],
    latest: dates[latest],
    days: latest - from,
    threshold,
    movers
  };
}
