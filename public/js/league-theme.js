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
  violet: 265,
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
  'HC Runes of Aldur': HUES.gold,
  // PoE1's current league is named for its embers.
  Allflame: HUES.ember,
  'Hardcore Allflame': HUES.ember
};

const PALETTE = Object.values(HUES);

/** Stable pick for a league we have no entry for, so a new one is themed on arrival. */
function derive(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export const hueFor = (league) => (league ? KNOWN[league] ?? derive(league) : HUES.gold);

/** Applies the tint. Called whenever the selected league changes. */
export function applyLeagueTheme(league) {
  document.documentElement.style.setProperty('--league-h', String(hueFor(league)));
}
