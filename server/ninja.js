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
 * Leagues worth fetching: the current ones, minus the realm's permanent leagues.
 *
 * Deliberately not filtered on poe.ninja's `indexed` flag. That flag lags reality
 * badly — it stayed false for Forbidden Rites while the league was already
 * trading — and a league missing from this list is invisible on the site. Empty
 * leagues cost one request each and are dropped by the caller once they come
 * back with nothing, so erring towards including them is the cheap mistake.
 */
export async function fetchIndexedLeagues(realm) {
  const cfg = REALMS[realm];
  const permanent = new Set(cfg.permanentLeagues ?? []);
  try {
    const state = await getJson(`${cfg.base}/api/data/index-state`);
    const leagues = (state.economyLeagues ?? [])
      .map((l) => ({ id: l.name, name: l.displayName ?? l.name }))
      .filter((l) => !permanent.has(l.id));
    if (leagues.length) return leagues;
  } catch {
    // fall through to the plain league list
  }
  return (await fetchLeagues(realm)).filter((l) => !permanent.has(l.id));
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
  const primary = payload.core?.primary;
  return payload.lines.map((line) => {
    const info = meta.get(line.id) ?? {};
    // The unit of account carries no price of its own — it is the thing prices
    // are quoted in — so the feed leaves it blank. It is worth exactly one of
    // itself, and saying "0" instead puts the league's own currency last.
    if (line.primaryValue == null && line.id === primary) line = { ...line, primaryValue: 1 };
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

const UNIT_LABEL = { divine: 'div', exalted: 'ex', chaos: 'chaos' };

/**
 * How to read a response's prices: the multiplier that turns its primary unit
 * into Divine, and the unit the result is actually in.
 *
 * PoE2 is normally primary=divine, so the factor is 1. PoE1 is primary=chaos and
 * publishes `rates.divine` as the divine value of one chaos, which is exactly
 * the multiplier we want.
 *
 * A league in its opening days is neither. Nobody has traded a Divine Orb yet,
 * so poe.ninja answers in Exalted and publishes no divine rate at all — and the
 * old code multiplied by that missing rate, which priced every line in the
 * league at exactly zero. When there is no rate we keep the numbers in the unit
 * they arrived in and report which one, so the site quotes "0.5 ex" instead of
 * an entire economy of "0 div".
 */
function priceBasis(core) {
  const primary = core?.primary ?? null;
  if (primary === 'divine') return { factor: 1, unit: 'div', primary };
  const rate = core?.rates?.divine;
  if (rate > 0) return { factor: rate, unit: 'div', primary };
  return { factor: 1, unit: UNIT_LABEL[primary] ?? 'ex', primary };
}

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

  const exchangeUrl = (type) =>
    `${cfg.base}/api/economy/exchange/current/overview?league=${q}&type=${type}`;
  const [anchorType, ...restTypes] = cfg.exchangeTypes;

  // Currency is fetched alone and first. It is the only response carrying a
  // usable exalted line, and on a league with no divine rate it decides which
  // unit the whole snapshot is quoted in — which the other categories then have
  // to agree with. One serial round-trip buys that consistency.
  let anchor = null;
  try {
    anchor = await getJson(exchangeUrl(anchorType.type));
  } catch (err) {
    errors.push(`${anchorType.type}: ${err.message}`);
  }

  const basis = priceBasis(anchor?.core);
  const rates = anchor ? ratesFrom(anchor.core, anchor.lines) : { exalted: 0, chaos: 0 };

  /**
   * Prefer a response's own rate, since a thin category can be quoted in a
   * different unit from Currency. Only fall back to the snapshot's basis when
   * the two agree on the unit — converting across a rate we do not have would
   * be off by the divine price, which is a factor of hundreds.
   */
  function converterFor(core) {
    const own = priceBasis(core);
    if (own.unit === 'div') return (v) => v * own.factor;
    if (own.primary === basis.primary) return (v) => v * basis.factor;
    return null;
  }

  function convert(data, type, onConvert) {
    const toDivine = converterFor(data.core);
    if (!toDivine) {
      // Unpriceable in the snapshot's unit. Publishing the raw numbers would
      // quietly mix currencies in one table, so drop them and say why.
      if (data.lines?.length) errors.push(`${type}: quoted in ${data.core?.primary}, no divine rate`);
      return [];
    }
    return onConvert(toDivine);
  }

  const itemJobs = cfg.itemTypes.map(({ type, label }) => async () => {
    try {
      const data = await getJson(
        `${cfg.base}/api/economy/stash/current/item/overview?league=${q}&type=${type}`
      );
      // PoE1 lines already carry a divine value; PoE2 needs its response's factor.
      if (realm === 'poe1') return normalisePoe1Items(data, label);
      return convert(data, type, (toDivine) => normalisePoe2Items(data, label, toDivine));
    } catch (err) {
      errors.push(`${type}: ${err.message}`);
      return [];
    }
  });

  const exchangeJobs = restTypes.map(({ type, label }) => async () => {
    try {
      const data = await getJson(exchangeUrl(type));
      return convert(data, type, (toDivine) => normaliseExchange(data, label, type, toDivine));
    } catch (err) {
      errors.push(`${type}: ${err.message}`);
      return [];
    }
  });

  const [items, currency] = await Promise.all([
    pooled(itemJobs).then((r) => r.flat()),
    pooled(exchangeJobs).then((r) => r.flat())
  ]);

  if (anchor) {
    currency.push(
      ...normaliseExchange(anchor, anchorType.label, anchorType.type, (v) => v * basis.factor)
    );
  }

  return {
    realm,
    league,
    updatedAt: new Date().toISOString(),
    rates,
    // What `divine` on every line below is actually denominated in. Normally
    // 'div'; 'ex' on a league too young to have a divine rate.
    priceUnit: basis.unit,
    secondaryUnit: cfg.secondaryUnit,
    items: items.sort((a, b) => b.divine - a.divine),
    currency: currency.sort((a, b) => b.divine - a.divine),
    errors
  };
}
