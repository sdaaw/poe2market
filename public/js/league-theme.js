/**
 * A quiet per-league tint.
 *
 * Only the chrome shifts — the brand mark, the active tab underline and a hairline
 * along the top of the header. Deliberately *not* `--accent`, which colours unique
 * item names: players read gold there as "this is a unique", and recolouring it
 * would look broken rather than themed. The red and green deltas carry meaning
 * too, so no hue lands near either of them.
 *
 * Only the hue varies. Saturation and lightness stay pinned to the values the gold
 * accent already uses, which means any hue arrives as a sibling of the existing
 * palette instead of an arbitrary colour, and hue 45 reproduces the default exactly.
 */

/**
 * Vetted hues. Every one is at least 25° from the loss red (hue 4) and 45° from
 * the gain green (hue 145), so a league tint can never be mistaken for a price
 * moving up or down.
 */
const HUES = {
  gold: 45.6,
  ember: 33,
  teal: 195,
  steel: 230,
  // Sampled from the Forbidden Rites event banner: a deep blue-violet, which the
  // art pairs with gold lettering — the same pairing the site lands on, since
  // unique names keep their gold.
  violet: 262,
  magenta: 310
};

/**
 * Leagues we have actually seen. Permanent leagues keep the default gold, so the
 * tint reads as "this is the current challenge league" rather than decoration.
 */
const KNOWN = {
  Standard: HUES.gold,
  Hardcore: HUES.gold,
  'Runes of Aldur': HUES.gold,
  // PoE1's current league is named for its embers.
  Allflame: HUES.ember,
  // Matched to the event banner's deep violet. Blood red would be the instinct
  // for a rite, and is exactly the hue reserved for a price falling.
  'Forbidden Rites': HUES.violet
};

const PALETTE = Object.values(HUES);

/**
 * A hardcore league is the same league. Both games mark it in the name — PoE2 as
 * "HC Runes of Aldur", PoE1 as "Hardcore Allflame" — so strip that before looking
 * anything up, or the two halves of one league would end up different colours.
 */
const parentLeague = (name) => name.replace(/^(HC|Hardcore)\s+/i, '').trim();

/** Stable pick for a league we have no entry for, so a new one is themed on arrival. */
function derive(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export function hueFor(league) {
  if (!league) return HUES.gold;
  const parent = parentLeague(league);
  return KNOWN[parent] ?? derive(parent);
}

/** Applies the tint. Called whenever the selected league changes. */
export function applyLeagueTheme(league) {
  document.documentElement.style.setProperty('--league-h', String(hueFor(league)));
}
