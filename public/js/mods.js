/**
 * What makes a unique distinctive.
 *
 * Most of a unique's modifier list is filler shared with dozens of other items —
 * resistances, attributes, flat life. Buried in it are the one or two lines that
 * exist nowhere else, and those are the reason the item is worth anything.
 * Headhunter's life and strength rolls appear on 185 and 78 other uniques; "you
 * gain its Modifiers for 60 seconds" appears on none.
 *
 * A word on what this does NOT claim. It measures how *rare* a modifier is, not
 * how *good* it is. The Gnashing Sash's "Lose 5% of maximum Life per second" is
 * rare and is a drawback. Nothing in the price data distinguishes a defining
 * upside from a defining downside, so this labels distinctiveness and leaves the
 * judgement to the reader.
 */
import { state } from './store.js';

/** Collapse numeric rolls so the same stat groups regardless of its numbers. */
export const normaliseMod = (text) =>
  text
    .replace(/\(\s*-?\d+(\.\d+)?\s*-\s*-?\d+(\.\d+)?\s*\)/g, '#')
    .replace(/-?\d+(\.\d+)?/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

/** True when the modifier rolls a range, so the number matters when buying. */
export const modRolls = (text) => /\(\s*-?\d+(\.\d+)?\s*-\s*-?\d+(\.\d+)?\s*\)/.test(text);

/** Variants of one unique are the same item for counting purposes. */
const baseName = (name) => name.replace(/^(Foulborn|Replica|Runemastered|Runeforged)\s+/, '').trim();

const allMods = (item) => [...(item.implicit ?? []), ...(item.explicit ?? []), ...(item.granted ?? [])];

let index = null;
let indexedSnapshot = null;

/**
 * How many distinct uniques carry each modifier. Counted over base names so a
 * six-link and its unlinked twin don't inflate every mod they share.
 */
function modIndex() {
  if (indexedSnapshot === state.snapshot && index) return index;

  const seen = new Map(); // base name -> item (best supplied wins)
  for (const item of state.snapshot?.items ?? []) {
    const key = baseName(item.name);
    const prev = seen.get(key);
    if (!prev || (item.listings ?? 0) > (prev.listings ?? 0)) seen.set(key, item);
  }

  index = new Map();
  for (const item of seen.values()) {
    for (const mod of new Set(allMods(item).map(normaliseMod))) {
      index.set(mod, (index.get(mod) ?? 0) + 1);
    }
  }
  indexedSnapshot = state.snapshot;
  return index;
}

export const carriersOf = (text) => modIndex().get(normaliseMod(text)) ?? 0;

/** Rare enough to be part of why this item exists, rather than filler. */
const DISTINCT_LIMIT = 3;

/**
 * Splits a unique's modifiers into the lines that set it apart and the ones it
 * shares with the rest of the pool.
 */
export function distinctiveMods(item) {
  const counts = modIndex();
  const scored = allMods(item).map((text) => ({
    text,
    carriers: counts.get(normaliseMod(text)) ?? 0,
    rolls: modRolls(text)
  }));

  return {
    defining: scored.filter((m) => m.carriers <= 1),
    rare: scored.filter((m) => m.carriers > 1 && m.carriers <= DISTINCT_LIMIT),
    common: scored.filter((m) => m.carriers > DISTINCT_LIMIT),
    total: scored.length
  };
}

/**
 * Tooltip body: the lines that make this unique what it is, then a count of the
 * filler. Capped, because a few uniques (Mageblood) carry a dozen defining lines.
 */
export function modSummary(item) {
  const { defining, rare, common, total } = distinctiveMods(item);
  const standout = [...defining, ...rare];

  const rows = [];
  const SHOWN = 5;

  for (const mod of standout.slice(0, SHOWN)) {
    rows.push({
      text: mod.text,
      badge: mod.carriers <= 1 ? 'only here' : `${mod.carriers} uniques`,
      rolls: mod.rolls,
      key: mod.carriers <= 1
    });
  }

  return {
    rows,
    hidden: Math.max(0, standout.length - SHOWN),
    common: common.length,
    total,
    // Nothing distinctive at all: the item is a pile of ordinary stats.
    plain: standout.length === 0
  };
}

/* ---------- randomised rolls ---------- */

let variantIndex = null;
let variantSnapshot = null;

/** Every line sharing a name, so one roll can be compared against its siblings. */
function byName() {
  if (variantSnapshot === state.snapshot && variantIndex) return variantIndex;
  variantIndex = new Map();
  for (const item of state.snapshot?.items ?? []) {
    if (!variantIndex.has(item.name)) variantIndex.set(item.name, []);
    variantIndex.get(item.name).push(item);
  }
  variantSnapshot = state.snapshot;
  return variantIndex;
}

/**
 * The priced roll combinations of this unique, dearest first.
 *
 * Only PoE1 has these: poe.ninja prices each rolled variant of a PoE1 unique
 * separately, which is what lets "Gem Level, Blue Requirements" sit at 6,788 div
 * while "Blue Requirements" alone sits at 0.71. PoE2 publishes one averaged price
 * per unique regardless of what it rolled, so there is nothing to compare.
 */
export function variantsOf(item) {
  if (!item.variant) return [];
  const siblings = (byName().get(item.name) ?? []).filter((i) => i.variant);
  return siblings.length > 1 ? [...siblings].sort((a, b) => b.divine - a.divine) : [];
}

/** Items whose modifiers are randomised but whose rolls are not priced apart. */
export const pooledRolls = (item) => item.randomised ?? [];
