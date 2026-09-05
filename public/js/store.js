/* Application state: one snapshot of the economy, plus who wants to know about it.
 *
 * The snapshots are static files built by scripts/snapshot.js and refreshed on a
 * schedule by CI, so the browser just reads JSON off the same origin. Paths are
 * relative on purpose — the site has to work from a project subpath such as
 * https://user.github.io/poe2-market/ as well as from a domain root.
 */

const listeners = new Set();

export const state = {
  realm: localStorage.getItem('poe2.realm') || 'poe2',
  league: localStorage.getItem('poe2.league') || null,
  realms: [],
  leagues: [],
  generatedAt: null,
  snapshot: null,
  loading: false,
  error: null
};

/** Both games have a "Standard" and a "Hardcore", so a league is only unique per realm. */
const sameLeague = (entry, realm, league) => entry.realm === realm && entry.id === league;

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
    state.realms = index.realms ?? [];
    state.generatedAt = index.generatedAt ?? null;

    // Keep only realms that actually produced data this build.
    const built = new Set(state.leagues.map((l) => l.realm));
    state.realms = state.realms.filter((r) => built.has(r.id));
    if (!built.has(state.realm)) state.realm = state.realms[0]?.id ?? state.realm;

    if (!state.leagues.some((l) => sameLeague(l, state.realm, state.league))) {
      state.league = leaguesFor(state.realm)[0]?.id ?? null;
    }
  } catch (err) {
    state.leagues = [];
    state.realms = [];
    state.error = `${err.message}. Run "npm run refresh" to build the data files.`;
  }
  emit();
}

/** Leagues belonging to one game. */
export const leaguesFor = (realm = state.realm) => state.leagues.filter((l) => l.realm === realm);

export async function loadSnapshot(league = state.league, realm = state.realm) {
  const entry =
    state.leagues.find((l) => sameLeague(l, realm, league)) ?? leaguesFor(realm)[0];

  if (!entry) {
    state.error = state.error ?? 'No league data has been built yet.';
    emit();
    return;
  }

  state.realm = entry.realm;
  state.league = entry.id;
  state.loading = true;
  state.error = null;
  localStorage.setItem('poe2.realm', entry.realm);
  localStorage.setItem('poe2.league', entry.id);
  emit();

  try {
    state.snapshot = await getJson(`data/${entry.file}`, { fresh: true });
    hydrateMods(entry, state.snapshot);
  } catch (err) {
    state.error = err.message;
    state.snapshot = null;
  } finally {
    state.loading = false;
    emit();
  }
}

/* ---------- modifier text ---------- */

let modsPromise = Promise.resolve(false);

/**
 * Modifier text is over a third of a snapshot and nothing on the landing page
 * needs it, so it arrives as a second file in the background.
 *
 * The fields are merged into the existing item objects rather than kept apart,
 * which means every view goes on reading `item.explicit` and only has to know
 * when the text became available — not where it came from.
 */
function hydrateMods(entry, snapshot) {
  if (!entry.mods) {
    snapshot.modsLoaded = true; // older build without a split; text is already inline
    return;
  }

  modsPromise = getJson(`data/${entry.mods}`)
    .then((byKey) => {
      // A league switch mid-flight must not pour one league's text into another.
      if (state.snapshot !== snapshot) return false;

      const items = new Map(snapshot.items.map((i) => [i.key, i]));
      for (const [key, fields] of Object.entries(byKey)) {
        const item = items.get(key);
        if (item) Object.assign(item, fields);
      }
      snapshot.modsLoaded = true;
      emit();
      return true;
    })
    .catch(() => false);
}

/** Resolves once modifier text has been merged in (or immediately if it failed). */
export const modsReady = () => modsPromise;

/** Whether item.explicit and friends can be trusted yet. */
export const hasMods = () => Boolean(state.snapshot?.modsLoaded);

/* ---------- derived selectors ---------- */

/**
 * Rates carry the realm's small-change unit alongside the numbers, so every
 * price formatter picks the right one without needing to know the realm:
 * PoE2 quotes cheap items in Exalted, PoE1 in Chaos.
 */
export const rates = () => ({
  exalted: state.snapshot?.rates?.exalted ?? 0,
  chaos: state.snapshot?.rates?.chaos ?? 0,
  secondary: state.snapshot?.secondaryUnit ?? 'ex',
  // Usually Divine. A league that has not traded one yet is priced in Exalted.
  base: state.snapshot?.priceUnit ?? 'div'
});
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
