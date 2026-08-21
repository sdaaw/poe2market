/**
 * Which league mechanic is actually worth farming?
 *
 * The naive answer — "the most expensive unique dropped here, so farm here" — is
 * wrong in a specific, expensive way. A 4,000 div chase unique with eleven
 * listings tells you almost nothing about what a run is worth, because you will
 * essentially never see one. What it measures is the ceiling of a lottery.
 *
 * What this dataset *can* answer honestly is the demand side:
 *
 *   depth        Total value traded this week. A deep market absorbs whatever you
 *                farm; a thin one collapses the moment you list a stack.
 *   breadth      How many distinct drops clear a worthwhile price. Broad tables
 *                pay out every run; narrow ones pay out on one item.
 *   consistency  How much of the turnover sits in a single item. High
 *                concentration is a lottery wearing a mechanic's clothes.
 *   momentum     Volume-weighted 7-day price movement. Heating or cooling.
 *
 * What it CANNOT answer, and does not pretend to: drop rates, clear speed, or
 * divine-per-hour. There is no drop-rate data in any public economy API. This
 * ranks where the money is and whether you can realise it — combine it with your
 * own clear times.
 */

/** Item families that drop broadly rather than from one mechanic. */
const GENERAL_DROPS = new Set(['Runes', 'UncutGems', 'Fragments']);

/** poe.ninja's key -> what a player calls the content, where the two differ. */
const CONTENT_NAMES = {
  Ritual: 'Ritual',
  Breach: 'Breach',
  Delirium: 'Delirium',
  Expedition: 'Expedition',
  Abyss: 'Abyss',
  Essences: 'Essences',
  SoulCores: 'Soul Cores',
  Idols: 'Idols',
  Verisium: 'Verisium',
  LineageSupportGems: 'Lineage Gems',
  Fragments: 'Fragments',
  Runes: 'Runes',
  UncutGems: 'Uncut Gems'
};

/** Worth bending down to pick up: roughly 18 Exalted at current rates. */
const WORTH_PICKING_UP = 0.05;

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Rank-based 0..1 normalisation: robust to the wild outliers in this data. */
function percentileRanks(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return values.map((v) => {
    const below = sorted.filter((s) => s < v).length;
    return values.length > 1 ? below / (values.length - 1) : 0.5;
  });
}

const WEIGHTS = { depth: 0.35, breadth: 0.25, consistency: 0.25, momentum: 0.15 };

/**
 * Builds one row per mechanic from the currency lines, scores them, and returns
 * them ranked. `currency` is the normalised array from a snapshot.
 */
export function analyseContent(currency) {
  const groups = new Map();
  for (const line of currency) {
    // The base currency category is the unit of account, not farmable content.
    if (!line.mechanic || line.mechanic === 'Currency') continue;
    if (!groups.has(line.mechanic)) groups.set(line.mechanic, []);
    groups.get(line.mechanic).push(line);
  }

  const rows = [...groups.entries()].map(([mechanic, lines]) => {
    const turnover = lines.reduce((sum, l) => sum + (l.volumeDivine ?? 0), 0);
    const topLine = lines.reduce(
      (best, l) => ((l.volumeDivine ?? 0) > (best?.volumeDivine ?? 0) ? l : best),
      null
    );
    const topShare = turnover > 0 ? (topLine?.volumeDivine ?? 0) / turnover : 1;
    const valuable = lines.filter((l) => l.divine >= WORTH_PICKING_UP);
    const momentum =
      turnover > 0
        ? lines.reduce((sum, l) => sum + (l.change ?? 0) * (l.volumeDivine ?? 0), 0) / turnover
        : 0;

    return {
      mechanic,
      name: CONTENT_NAMES[mechanic] ?? mechanic,
      drops: lines[0]?.category ?? mechanic,
      general: GENERAL_DROPS.has(mechanic),
      turnover,
      topShare,
      topItem: topLine,
      valuable: valuable.length,
      tracked: lines.length,
      medianValue: median(valuable.map((l) => l.divine)),
      momentum
    };
  });

  if (!rows.length) return [];

  // Score against the other mechanics, not against absolute thresholds — what
  // counts as "deep" depends entirely on the league and how old it is.
  const depth = percentileRanks(rows.map((r) => Math.log10(Math.max(r.turnover, 1))));
  const breadth = percentileRanks(rows.map((r) => r.valuable));
  const consistency = percentileRanks(rows.map((r) => 1 - r.topShare));
  // Clamped: a mechanic does not deserve top billing purely for a 200% spike.
  const momentum = percentileRanks(rows.map((r) => Math.max(-40, Math.min(40, r.momentum))));

  rows.forEach((row, i) => {
    row.parts = {
      depth: depth[i],
      breadth: breadth[i],
      consistency: consistency[i],
      momentum: momentum[i]
    };
    row.score =
      WEIGHTS.depth * depth[i] +
      WEIGHTS.breadth * breadth[i] +
      WEIGHTS.consistency * consistency[i] +
      WEIGHTS.momentum * momentum[i];
    row.profile = profileOf(row);
  });

  return rows.sort((a, b) => b.score - a.score);
}

/**
 * The shape of the payout, which matters more than the headline number: two
 * mechanics with identical turnover feel completely different to farm if one
 * pays out every map and the other pays out once a week.
 */
function profileOf(row) {
  if (row.topShare >= 0.75) return 'lottery';
  if (row.topShare >= 0.5) return 'top-heavy';
  if (row.valuable >= 20) return 'broad';
  return 'steady';
}

export const PROFILE_NOTES = {
  lottery: 'nearly all demand sits on one item — feast or famine',
  'top-heavy': 'one item carries most of the value',
  broad: 'many drops worth picking up',
  steady: 'value spread across a handful of drops'
};

/**
 * One honest sentence explaining a ranking. Deliberately quotes the numbers
 * rather than superlatives — several mechanics sit in the top quartile at once,
 * so "the deepest market" would be true of more than one of them.
 */
export function explain(row) {
  const turnover =
    row.turnover >= 1000 ? `${(row.turnover / 1000).toFixed(1)}k` : Math.round(row.turnover);
  const bits = [`${turnover} div traded this week`];

  if (row.valuable >= 15) bits.push(`${row.valuable} drops worth listing`);
  if (row.topShare <= 0.4) bits.push(`no single item is more than ${Math.round(row.topShare * 100)}% of demand`);
  else if (row.topShare >= 0.75) bits.push(`but ${Math.round(row.topShare * 100)}% of that is one item`);

  if (row.momentum > 5) bits.push(`prices up ${row.momentum.toFixed(0)}% over seven days`);
  else if (row.momentum < -5) bits.push(`prices down ${Math.abs(row.momentum).toFixed(0)}% over seven days`);

  return `${row.name}: ${bits.join(', ')}.`;
}
