/* Application state: one snapshot of the economy, plus who wants to know about it.
 *
 * The snapshots are static files built by scripts/snapshot.js and refreshed on a
 * schedule by CI, so the browser just reads JSON off the same origin. Paths are
 * relative on purpose — the site has to work from a project subpath such as
 * https://user.github.io/poe2-market/ as well as from a domain root.
 */

const listeners = new Set();

export const state = {
  league: localStorage.getItem('poe2.league') || null,
  leagues: [],
  generatedAt: null,
  snapshot: null,
  loading: false,
  error: null
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(state);
}

async function getJson(url, { fresh = false } = {}) {
  const res = await fetch(url, fresh ? { cache: 'reload' } : undefined);
  if (!res.ok) throw new Error(`Could not load ${url} (${res.status})`);
  return res.json();
}

export async function loadLeagues() {
  try {
    const index = await getJson('data/leagues.json', { fresh: true });
    state.leagues = index.leagues ?? [];
    state.generatedAt = index.generatedAt ?? null;

    if (!state.leagues.some((l) => l.id === state.league)) {
      state.league = state.leagues[0]?.id ?? null;
    }
  } catch (err) {
    state.leagues = [];
    state.error = `${err.message}. Run "npm run refresh" to build the data files.`;
  }
  emit();
}

export async function loadSnapshot(league = state.league) {
  const entry = state.leagues.find((l) => l.id === league) ?? state.leagues[0];
  if (!entry) {
    state.error = state.error ?? 'No league data has been built yet.';
    emit();
    return;
  }

  state.league = entry.id;
  state.loading = true;
  state.error = null;
  localStorage.setItem('poe2.league', entry.id);
  emit();

  try {
    state.snapshot = await getJson(`data/${entry.file}`, { fresh: true });
  } catch (err) {
    state.error = err.message;
    state.snapshot = null;
  } finally {
    state.loading = false;
    emit();
  }
}

/* ---------- derived selectors ---------- */

export const rates = () => state.snapshot?.rates ?? { exalted: 0, chaos: 0 };
export const items = () => state.snapshot?.items ?? [];
export const currency = () => state.snapshot?.currency ?? [];

/** Find a currency line by display name (used for the Mirror / Divine highlights). */
export function findCurrency(name) {
  return currency().find((c) => c.name.toLowerCase() === name.toLowerCase());
}

/**
 * A "liquid" item has enough listings that its average price means something.
 * One-off listings on a corrupted mirror-tier item skew every leaderboard.
 */
export const liquid = (list, min = 3) => list.filter((x) => (x.listings ?? 0) >= min);

/**
 * A percentage swing only means something if somebody actually traded the thing
 * and it was worth something to begin with. Thin markets on poe.ninja routinely
 * post four-digit "gains" off two listings, and a junk unique bouncing between
 * one and six Exalted is a rounding artefact, not a trend.
 */
export const meaningful = (x) =>
  x.kind === 'item'
    ? (x.listings ?? 0) >= 10 && x.divine >= 0.05
    : (x.volumeDivine ?? 0) >= 50 && x.divine >= 0.01;

/* ---------- stable ids for links ---------- */

/**
 * A URL-safe id for one entry. Derived from the composite key rather than the
 * display name, which keeps the two Temporalis variants distinct — verified
 * collision-free across every tracked entry.
 */
export const slugFor = (entry) =>
  entry.key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

let slugIndex = null;
let indexedSnapshot = null;

/** Resolves a slug from the URL back to its entry, rebuilding when the league changes. */
export function findBySlug(slug) {
  if (!slug || !state.snapshot) return null;

  if (indexedSnapshot !== state.snapshot) {
    slugIndex = new Map();
    for (const entry of [...items(), ...currency()]) slugIndex.set(slugFor(entry), entry);
    indexedSnapshot = state.snapshot;
  }
  return slugIndex.get(slug) ?? null;
}
