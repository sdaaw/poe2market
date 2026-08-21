/**
 * Thin client for poe.ninja's Path of Exile 2 economy API.
 *
 * Every price in the upstream payload is expressed in Divine Orbs (`core.primary`),
 * with `core.rates` giving the Divine -> Exalted / Chaos conversion. We keep Divine
 * as the canonical unit and let the browser convert on demand.
 */

const BASE = 'https://poe.ninja/poe2';
const UA = 'poe2-market-dashboard (local, non-commercial)';

/** Unique / stash item categories, in the order they are shown in the UI. */
export const ITEM_TYPES = [
  { type: 'UniqueWeapons', label: 'Weapons' },
  { type: 'UniqueArmours', label: 'Armour' },
  { type: 'UniqueAccessories', label: 'Accessories' },
  { type: 'UniqueJewels', label: 'Jewels' },
  { type: 'UniqueFlasks', label: 'Flasks' },
  { type: 'UniqueCharms', label: 'Charms' },
  { type: 'UniqueSanctumRelics', label: 'Relics' },
  { type: 'UniqueTablets', label: 'Tablets' },
  { type: 'PrecursorTablets', label: 'Precursor Tablets' }
];

/** Currency exchange categories. */
export const EXCHANGE_TYPES = [
  { type: 'Currency', label: 'Currency' },
  { type: 'Fragments', label: 'Fragments' },
  { type: 'Runes', label: 'Runes' },
  { type: 'SoulCores', label: 'Soul Cores' },
  { type: 'Essences', label: 'Essences' },
  { type: 'UncutGems', label: 'Uncut Gems' },
  { type: 'LineageSupportGems', label: 'Lineage Gems' },
  { type: 'Ritual', label: 'Omens' },
  { type: 'Delirium', label: 'Liquid Emotions' },
  { type: 'Breach', label: 'Catalysts' },
  { type: 'Abyss', label: 'Abyssal Bones' },
  { type: 'Expedition', label: 'Expedition' },
  { type: 'Idols', label: 'Idols' },
  { type: 'Verisium', label: 'Verisium' }
];

const CDN = 'https://web.poecdn.com';

const icon = (src) => (!src ? null : src.startsWith('http') ? src : CDN + src);

async function getJson(url, { timeout = 20000 } = {}) {
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

export async function fetchLeagues() {
  const leagues = await getJson(`${BASE}/api/economy/leagues`);
  return leagues.map((l) => ({ id: l.id, name: l.name }));
}

/**
 * Only some leagues actually carry economy data — poe.ninja stops indexing the
 * permanent leagues, and their endpoints answer 200 with an empty list. The
 * index-state document tells us which ones are worth fetching.
 */
export async function fetchIndexedLeagues() {
  try {
    const state = await getJson(`${BASE}/api/data/index-state`);
    const indexed = (state.economyLeagues ?? [])
      .filter((l) => l.indexed)
      .map((l) => ({ id: l.name, name: l.displayName ?? l.name, hardcore: Boolean(l.hardcore) }));
    if (indexed.length) return indexed;
  } catch {
    // fall through to the plain league list
  }
  return fetchLeagues();
}

const mods = (list) => (list ?? []).map((m) => cleanTags(m.text));

function normaliseItems(payload, category) {
  return payload.lines.map((line) => ({
    kind: 'item',
    key: `${category}:${line.detailsId ?? line.itemId}`,
    name: line.name ?? line.itemId,
    baseType: line.baseType ?? '',
    category,
    // e.g. "Ezomyte [Sword|One Hand Sword]" -> "One Hand Sword"
    slot: cleanTags(line.category ?? ''),
    icon: icon(line.icon),
    divine: line.primaryValue ?? 0,
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
    requirements: mods(line.requirementModifiers)
  }));
}

/** poe.ninja wraps game keywords as `[Display|Tooltip]` or `[Word]`; keep the readable half. */
function cleanTags(text) {
  return text.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1').trim();
}

function normaliseExchange(payload, category) {
  const meta = new Map((payload.items ?? []).map((i) => [i.id, i]));
  return payload.lines.map((line) => {
    const info = meta.get(line.id) ?? {};
    return {
      kind: 'currency',
      key: `${category}:${line.id}`,
      name: info.name ?? line.id,
      category,
      icon: icon(info.image),
      divine: line.primaryValue ?? 0,
      // How many of this item trade per unit of the deepest-liquidity currency.
      volumeRate: line.maxVolumeRate ?? 0,
      volumeCurrency: line.maxVolumeCurrency ?? null,
      volumeDivine: line.volumePrimaryValue ?? 0,
      change: line.sparkline?.totalChange ?? 0,
      spark: (line.sparkline?.data ?? []).filter((n) => n !== null)
    };
  });
}

/**
 * Pulls every tracked category for a league and folds it into one snapshot.
 * A category that fails upstream is skipped rather than failing the whole request.
 */
export async function fetchSnapshot(league) {
  const q = encodeURIComponent(league);
  const errors = [];
  let rates = { exalted: 0, chaos: 0 };

  const itemJobs = ITEM_TYPES.map(({ type, label }) => async () => {
    try {
      const data = await getJson(
        `${BASE}/api/economy/stash/current/item/overview?league=${q}&type=${type}`
      );
      if (data.core?.rates) rates = data.core.rates;
      return normaliseItems(data, label);
    } catch (err) {
      errors.push(`${type}: ${err.message}`);
      return [];
    }
  });

  const exchangeJobs = EXCHANGE_TYPES.map(({ type, label }) => async () => {
    try {
      const data = await getJson(
        `${BASE}/api/economy/exchange/current/overview?league=${q}&type=${type}`
      );
      if (data.core?.rates) rates = data.core.rates;
      return normaliseExchange(data, label);
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
    league,
    updatedAt: new Date().toISOString(),
    rates,
    items: items.sort((a, b) => b.divine - a.divine),
    currency: currency.sort((a, b) => b.divine - a.divine),
    errors
  };
}
