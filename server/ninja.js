/**
 * Client for poe.ninja's economy API, for both Path of Exile 1 and 2.
 *
 * The two realms differ in ways that matter:
 *
 *   - Currency responses share a shape, but the unit of account does not. PoE2
 *     quotes in Divine Orbs; PoE1 quotes in Chaos and carries a divine rate.
 *   - Item responses do not share a shape at all. PoE2 returns `primaryValue`
 *     with a `core` block; PoE1 returns `chaosValue` / `divineValue` per line,
 *     plus PoE1-only fields such as socket links.
 *
 * Everything is normalised to Divine Orbs and one field naming, so nothing
 * downstream has to know which game it is looking at.
 */
import { REALMS } from './realms.js';

const UA = 'poe2-market-dashboard (local, non-commercial)';
const CDN = 'https://web.poecdn.com';

const icon = (src) => (!src ? null : src.startsWith('http') ? src : CDN + src);

async function getJson(url, { timeout = 30000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`poe.ninja responded ${res.status} for ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Runs `jobs` with a small concurrency cap so we stay a polite API citizen. */
async function pooled(jobs, limit = 4) {
  const results = new Array(jobs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, jobs.length) }, async () => {
    while (cursor < jobs.length) {
      const i = cursor++;
      results[i] = await jobs[i]();
    }
  });
  await Promise.all(workers);
  return results;
}

/** poe.ninja wraps game keywords as `[Display|Tooltip]` or `[Word]`; keep the readable half. */
function cleanTags(text) {
  return text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1').trim();
}

const mods = (list) => (list ?? []).map((m) => cleanTags(m.text));

/**
 * Modifiers the feed marks `optional` — the item's randomised pool. An individual
 * copy carries only some of them, which is why two of the same unique can be
 * worth wildly different amounts.
 */
const randomised = (...lists) =>
  lists.flatMap((list) => (list ?? []).filter((m) => m.optional).map((m) => cleanTags(m.text)));

/* ---------- leagues ---------- */

export async function fetchLeagues(realm) {
  const leagues = await getJson(`${REALMS[realm].base}/api/economy/leagues`);
  return leagues.map((l) => ({ id: l.id, name: l.name }));
}

/**
 * Leagues worth fetching. PoE2 marks which it still indexes; PoE1 does not, so
 * there we take the current list and let empty responses fall out later.
 */
export async function fetchIndexedLeagues(realm) {
  const cfg = REALMS[realm];
  try {
    const state = await getJson(`${cfg.base}/api/data/index-state`);
    const leagues = (state.economyLeagues ?? [])
      .filter((l) => (cfg.respectIndexedFlag ? l.indexed : true))
      .map((l) => ({ id: l.name, name: l.displayName ?? l.name }));
    if (leagues.length) return leagues;
  } catch {
    // fall through to the plain league list
  }
  return fetchLeagues(realm);
}

/* ---------- normalisation ---------- */

/** PoE2 items: one `primaryValue` in the response's primary unit. */
function normalisePoe2Items(payload, category, toDivine) {
  return payload.lines.map((line) => ({
    kind: 'item',
    key: `${category}:${line.detailsId ?? line.itemId}`,
    name: line.name ?? line.itemId,
    baseType: line.baseType ?? '',
    category,
    slot: cleanTags(line.category ?? ''),
    icon: icon(line.icon),
    divine: toDivine(line.primaryValue ?? 0),
    listings: line.listingCount ?? 0,
    level: line.levelRequired ?? 0,
    corrupted: Boolean(line.corrupted),
    change: line.sparkLine?.totalChange ?? 0,
    spark: (line.sparkLine?.data ?? []).filter((n) => n !== null),
    flavour: line.flavourText ?? '',
    explicit: mods(line.explicitModifiers),
    implicit: mods(line.implicitModifiers),
    granted: mods(line.grantedSkillModifiers),
    properties: mods(line.propertyModifiers),
    requirements: mods(line.requirementModifiers),
    randomised: randomised(line.explicitModifiers, line.implicitModifiers)
  }));
}

/** PoE1 items: pre-converted values per line, plus socket links. */
function normalisePoe1Items(payload, category) {
  return payload.lines.map((line) => ({
    kind: 'item',
    key: `${category}:${line.detailsId ?? line.id}`,
    name: line.name ?? '',
    baseType: line.baseType ?? '',
    category,
    slot: line.itemType ?? '',
    icon: icon(line.icon),
    divine: line.divineValue ?? 0,
    listings: line.listingCount ?? line.count ?? 0,
    level: line.levelRequired ?? 0,
    // A 5- or 6-linked version of the same unique is a different market.
    links: line.links || null,
    corrupted: Boolean(line.corrupted),
    change: line.sparkLine?.totalChange ?? 0,
    spark: (line.sparkLine?.data ?? []).filter((n) => n !== null),
    flavour: line.flavourText ?? '',
    explicit: mods(line.explicitModifiers),
    implicit: mods(line.implicitModifiers),
    granted: [],
    properties: [],
    requirements: [],
    randomised: randomised(line.explicitModifiers, line.implicitModifiers),
    // PoE1 prices each rolled combination separately. `variant` names the roll
    // ("Gem Level, Blue Requirements") and `mutated` is what it actually rolled,
    // which is how two copies of one unique end up thousands of Divine apart.
    variant: line.variant ?? null,
    mutated: mods(line.mutatedModifiers)
  }));
}

/** Currency is the one shape both realms agree on. */
function normaliseExchange(payload, category, mechanic, toDivine) {
  const meta = new Map((payload.items ?? []).map((i) => [i.id, i]));
  return payload.lines.map((line) => {
    const info = meta.get(line.id) ?? {};
    return {
      kind: 'currency',
      key: `${category}:${line.id}`,
      name: info.name ?? line.id,
      category,
      mechanic,
      icon: icon(info.image),
      divine: toDivine(line.primaryValue ?? 0),
      volumeRate: line.maxVolumeRate ?? 0,
      volumeCurrency: line.maxVolumeCurrency ?? null,
      volumeDivine: toDivine(line.volumePrimaryValue ?? 0),
      change: line.sparkline?.totalChange ?? 0,
      spark: (line.sparkline?.data ?? []).filter((n) => n !== null)
    };
  });
}

/**
 * Divine-per-primary-unit for a response.
 *
 * PoE2 is already primary=divine, so the factor is 1. PoE1 is primary=chaos and
 * publishes `rates.divine` as the divine value of one chaos, which is exactly
 * the multiplier we want.
 */
const divineFactor = (core) => (core?.primary === 'divine' ? 1 : core?.rates?.divine ?? 0);

/**
 * Rates expressed as "how many of this per one Divine", which is how the header
 * reads them. PoE1 has to derive Exalted from the currency listing itself.
 */
function ratesFrom(core, lines) {
  if (core?.primary === 'divine') {
    return { exalted: core.rates?.exalted ?? 0, chaos: core.rates?.chaos ?? 0 };
  }
  const chaosPerDivine = core?.rates?.divine ? 1 / core.rates.divine : 0;
  const exaltedInChaos = lines?.find((l) => l.id === 'exalted')?.primaryValue ?? 0;
  return {
    chaos: chaosPerDivine,
    exalted: exaltedInChaos > 0 ? chaosPerDivine / exaltedInChaos : 0
  };
}

/* ---------- snapshot ---------- */

/**
 * Pulls every tracked category for one league and folds it into a snapshot.
 * A category that fails upstream is skipped rather than failing the whole build.
 */
export async function fetchSnapshot(realm, league) {
  const cfg = REALMS[realm];
  const q = encodeURIComponent(league);
  const errors = [];
  let rates = { exalted: 0, chaos: 0 };

  const itemJobs = cfg.itemTypes.map(({ type, label }) => async () => {
    try {
      const data = await getJson(
        `${cfg.base}/api/economy/stash/current/item/overview?league=${q}&type=${type}`
      );
      // PoE1 lines already carry a divine value; PoE2 needs its response's factor.
      if (realm === 'poe1') return normalisePoe1Items(data, label);
      const factor = divineFactor(data.core) || 1;
      return normalisePoe2Items(data, label, (v) => v * factor);
    } catch (err) {
      errors.push(`${type}: ${err.message}`);
      return [];
    }
  });

  const exchangeJobs = cfg.exchangeTypes.map(({ type, label }) => async () => {
    try {
      const data = await getJson(
        `${cfg.base}/api/economy/exchange/current/overview?league=${q}&type=${type}`
      );
      const factor = divineFactor(data.core);
      // The Currency response is the one that carries a usable exalted line.
      if (type === 'Currency' || rates.chaos === 0) {
        rates = ratesFrom(data.core, data.lines);
      }
      return normaliseExchange(data, label, type, (v) => v * factor);
    } catch (err) {
      errors.push(`${type}: ${err.message}`);
      return [];
    }
  });

  const [items, currency] = await Promise.all([
    pooled(itemJobs).then((r) => r.flat()),
    pooled(exchangeJobs).then((r) => r.flat())
  ]);

  return {
    realm,
    league,
    updatedAt: new Date().toISOString(),
    rates,
    secondaryUnit: cfg.secondaryUnit,
    items: items.sort((a, b) => b.divine - a.divine),
    currency: currency.sort((a, b) => b.divine - a.divine),
    errors
  };
}
