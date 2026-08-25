import { el, priceCell, priceLabel, listingLabel, deltaEl, sparkline, itemCell, searchIcon, highlight } from '../util.js';
import { createTable } from '../table.js';
import { openDetail } from '../detail.js';
import { items, rates, modsReady } from '../store.js';
import { modSummary, variantsOf, pooledRolls } from '../mods.js';
import { showTip, moveTip, hideTip } from '../tooltip.js';

/** Both games' categories in one running order; each realm shows only its own. */
const CATEGORY_ORDER = [
  'Weapons', 'Armour', 'Accessories', 'Jewels', 'Forbidden Jewels', 'Flasks',
  'Tinctures', 'Charms', 'Relics', 'Tablets', 'Precursor Tablets', 'Maps'
];

/** Preferred order first, then anything the feed added that we haven't listed. */
function orderCategories(all) {
  const present = new Set(all.map((i) => i.category));
  const known = CATEGORY_ORDER.filter((c) => present.has(c));
  const extra = [...present].filter((c) => c && !CATEGORY_ORDER.includes(c)).sort();
  return [...known, ...extra];
}

const MIN_LISTINGS = [
  { label: 'All listings', value: 0 },
  { label: '3+ listed', value: 3 },
  { label: '10+ listed', value: 10 }
];

/** Stats worth a one-click search, chosen for how much of the pool they actually cover. */
const STAT_PICKS = [
  'Spirit', 'Movement Speed', 'Energy Shield', 'Life Regeneration',
  'Attack Speed', 'Spell Damage', 'Critical', 'Resistance', 'Minion'
];

/**
 * One lowercase haystack per item, built once per visit to this page rather than
 * on every keystroke. Mods are the whole point of the search, so they lead.
 */
let haystacks = new WeakMap();

function searchable(item) {
  let cached = haystacks.get(item);
  if (!cached) {
    const mods = [...(item.implicit ?? []), ...(item.explicit ?? []), ...(item.granted ?? [])];
    cached = {
      mods,
      text: [item.name, item.baseType, item.slot ?? '', ...mods].join('   ').toLowerCase()
    };
    haystacks.set(item, cached);
  }
  return cached;
}

/** The first modifier matching the query, so a row can show why it was returned. */
const matchingMod = (item, query) =>
  query ? searchable(item).mods.find((m) => m.toLowerCase().includes(query)) : undefined;

/**
 * A single modifier can carry line breaks — two clauses of one mod. The row gives
 * it one line, so join them visibly rather than letting them run together.
 */
const oneLine = (text) => text.replace(/\s*\n\s*/g, ' · ').trim();

export function renderUniques() {
  const r = rates();
  const all = items();

  const categories = orderCategories(all);
  const hasLinks = all.some((i) => i.links);
  const filters = { query: '', category: 'All', minListings: 3 };

  const page = el('div');
  page.append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Unique items' }),
      el('p', {
        text: `${all.length} uniques tracked across ${categories.length} categories. Search matches modifiers as well as names — try "spirit" or "movement speed".`
      })
    ])
  );

  const count = el('span', { class: 'count' });

  const searchBox = el('label', { class: 'search' }, [
    el('span', { class: 'sr-only', text: 'Search uniques' }),
    searchIcon(),
    el('input', {
      type: 'search',
      placeholder: 'Search names and modifiers…',
      oninput: (e) => {
        filters.query = e.target.value.trim().toLowerCase();
        syncStatChips();
        apply();
      }
    })
  ]);

  const catChips = el('div', { class: 'chips' },
    ['All', ...categories].map((c) =>
      el('button', {
        class: `chip${c === filters.category ? ' is-on' : ''}`,
        text: c,
        onclick: (e) => {
          filters.category = c;
          [...e.target.parentElement.children].forEach((n) => n.classList.toggle('is-on', n === e.target));
          apply();
        }
      })
    )
  );

  const listingChips = el('div', { class: 'chips' },
    MIN_LISTINGS.map((opt) =>
      el('button', {
        class: `chip${opt.value === filters.minListings ? ' is-on' : ''}`,
        text: opt.label,
        onclick: (e) => {
          filters.minListings = opt.value;
          [...e.target.parentElement.children].forEach((n) => n.classList.toggle('is-on', n === e.target));
          apply();
        }
      })
    )
  );

  const searchInput = searchBox.querySelector('input');

  // One-click searches for the stats people actually shop for.
  const statChips = el('div', { class: 'chips chips--stats' }, [
    el('span', { class: 'chips__label', text: 'Stats' }),
    ...STAT_PICKS.map((stat) =>
      el('button', {
        class: 'chip',
        text: stat,
        onclick: () => {
          const off = filters.query === stat.toLowerCase();
          searchInput.value = off ? '' : stat;
          filters.query = off ? '' : stat.toLowerCase();
          syncStatChips();
          apply();
        }
      })
    )
  ]);

  function syncStatChips() {
    for (const chip of statChips.querySelectorAll('.chip')) {
      chip.classList.toggle('is-on', chip.textContent.toLowerCase() === filters.query);
    }
  }

  page.append(
    el('div', { class: 'controls' }, [searchBox, catChips, el('span', { class: 'spacer' }), listingChips, count]),
    statChips
  );

  const table = createTable({
    columns: [
      { key: 'rank', label: '#', sortable: false, render: (_, i) => el('span', { class: 'rank', text: i + 1 }) },
      {
        key: 'name',
        label: 'Item',
        value: (x) => x.name,
        render: (x) => {
          const mod = matchingMod(x, filters.query);
          // Only worth showing when the name itself didn't already explain the match.
          const nameHit = `${x.name} ${x.baseType}`.toLowerCase().includes(filters.query);
          const note =
            mod && !nameHit
              ? el('div', { class: 'item__mod', title: mod }, [highlight(oneLine(mod), filters.query)])
              : null;
          // PoE1 lists the same unique once per rolled combination; without the
          // variant name those rows are indistinguishable.
          return itemCell(x, { note, tag: x.variant });
        }
      },
      {
        key: 'slot',
        label: 'Slot',
        hide: true,
        value: (x) => x.slot || x.category,
        render: (x) => el('span', { class: 'tag', text: x.slot || x.category })
      },
      // PoE1 only: a 5- or 6-link is a different market for the same unique.
      hasLinks && {
        key: 'links',
        label: 'Links',
        align: 'right',
        hide: true,
        value: (x) => x.links ?? 0,
        render: (x) => (x.links ? el('span', { class: 'tag', text: `${x.links}L` }) : el('span', { class: 'price__alt', text: '—' }))
      },
      { key: 'level', label: 'Lvl', align: 'right', hide: true, render: (x) => el('span', { class: 'num', text: x.level || '—' }) },
      { key: 'listings', label: 'Listed', align: 'right', render: (x) => el('span', { class: 'num', text: listingLabel(x.listings) }) },
      { key: 'spark', label: 'Trend', sortable: false, hide: true, render: (x) => sparkline(x.spark, x.change) },
      { key: 'change', label: '7 days', align: 'right', render: (x) => deltaEl(x.change) },
      { key: 'divine', label: 'Price', align: 'right', render: (x) => priceCell(x.divine, r) }
    ].filter(Boolean),
    rows: [],
    sortKey: 'divine',
    onRow: openDetail,
    limit: 300
  });

  // Hovering a row explains what sets that unique apart, so a list can be
  // scanned without opening every item. Delegated, because the table rebuilds
  // its rows on every filter and sort.
  let hovered = null;
  table.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return; // a tooltip would fight the tap
    const row = e.target.closest('tbody tr');
    const item = row && table.rowData.get(row);
    if (!item) {
      hovered = null;
      hideTip();
      return;
    }
    if (row !== hovered) {
      hovered = row;
      showTip(tipFor(item), e.clientX, e.clientY);
    }
  });
  table.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') moveTip(e.clientX, e.clientY);
  });
  table.addEventListener('pointerleave', () => {
    hovered = null;
    hideTip();
  });

  page.append(table);

  function apply() {
    const rows = all.filter((it) => {
      if (filters.category !== 'All' && it.category !== filters.category) return false;
      if ((it.listings ?? 0) < filters.minListings) return false;
      if (!filters.query) return true;
      return searchable(it).text.includes(filters.query);
    });
    count.textContent = `${rows.length} items`;
    table.update(rows);
  }

  apply();

  // Modifier text arrives after the prices. Rebuild the search index and re-run
  // the current filters — apply() only replaces rows, so the reader keeps their
  // query, category and place on the page.
  modsReady().then((loaded) => {
    if (!loaded) return;
    haystacks = new WeakMap();
    apply();
  });

  return page;
}


/**
 * Tooltip body for one unique.
 *
 * Which of three questions it answers depends on what the feed knows:
 *   - PoE1 prices each rolled combination separately, so show the ladder.
 *   - Some uniques roll from a pool with no per-roll pricing, so say the price
 *     is an average and name the pool.
 *   - Otherwise fall back to what sets the item apart from other uniques.
 */
function tipFor(item) {
  const variants = variantsOf(item);
  if (variants.length) return tipVariants(item, variants);

  // A pool has to be big enough to actually swing the price. Headhunter's two
  // charm-slot lines are randomised and irrelevant; what matters there is the
  // modifier no other unique has.
  const pool = pooledRolls(item);
  if (pool.length >= 3) return tipPool(item, pool);

  return tipDistinctive(item);
}

/** The roll ladder: what each combination of this unique actually sells for. */
function tipVariants(item, variants) {
  const r = rates();
  const SHOWN = 6;
  const best = variants[0].divine;
  const worst = variants[variants.length - 1].divine;
  const spread = worst > 0 ? best / worst : 0;

  return el('div', { class: 'tip__body' }, [
    el('div', { class: 'tip__name', text: item.name }),
    el('p', { class: 'tip__note', text: 'What each roll sells for' }),
    el('ul', { class: 'tip__rolls' }, variants.slice(0, SHOWN).map((v) =>
      el('li', { class: v === item ? 'is-current' : '' }, [
        el('span', { class: 'tip__price', text: priceLabel(v.divine, r) }),
        el('span', { class: 'tip__variant', text: v.variant }),
        v.links ? el('span', { class: 'tip__badge', text: `${v.links}L` }) : null,
        el('span', { class: 'tip__listings', text: listingLabel(v.listings) })
      ])
    )),
    variants.length > SHOWN
      ? el('p', { class: 'tip__more', text: `+${variants.length - SHOWN} more rolls` })
      : null,
    spread >= 5
      ? el('p', { class: 'tip__more', text: `The best roll is worth ${Math.round(spread)}x the worst.` })
      : null
  ]);
}

/** Randomised, but every roll priced as one: say so rather than imply precision. */
function tipPool(item, pool) {
  const SHOWN = 5;
  return el('div', { class: 'tip__body' }, [
    el('div', { class: 'tip__name', text: item.name }),
    el('p', { class: 'tip__note', text: 'Randomised modifiers' }),
    el('ul', { class: 'tip__mods' }, pool.slice(0, SHOWN).map((text) =>
      el('li', {}, [el('span', { class: 'tip__text', text: oneLine(text) })])
    )),
    pool.length > SHOWN
      ? el('p', { class: 'tip__more', text: `+${pool.length - SHOWN} more possible modifiers` })
      : null,
    el('p', {
      class: 'tip__warn',
      text: `A copy carries only some of these ${pool.length}. poe.ninja prices every roll together, so the listed price is an average of good and bad ones.`
    })
  ]);
}

/** Nothing randomised: show the lines no other unique has. */
function tipDistinctive(item) {
  const summary = modSummary(item);

  if (summary.plain) {
    return el('div', { class: 'tip__body' }, [
      el('div', { class: 'tip__name', text: item.name }),
      el('p', {
        class: 'tip__note',
        text: summary.total
          ? 'Nothing here is exclusive — every modifier is shared with other uniques.'
          : 'No modifiers listed.'
      })
    ]);
  }

  return el('div', { class: 'tip__body' }, [
    el('div', { class: 'tip__name', text: item.name }),
    el('p', { class: 'tip__note', text: 'What sets it apart' }),
    el('ul', { class: 'tip__mods' }, summary.rows.map((m) =>
      el('li', { class: m.key ? 'is-key' : '' }, [
        el('span', { class: 'tip__text', text: oneLine(m.text) }),
        el('span', { class: 'tip__badge', text: m.badge }),
        m.rolls && el('span', { class: 'tip__roll', title: 'This modifier rolls a range', text: 'rolls' })
      ])
    )),
    summary.hidden ? el('p', { class: 'tip__more', text: `+${summary.hidden} more` }) : null,
    summary.common
      ? el('p', { class: 'tip__more', text: `${summary.common} further modifier${summary.common === 1 ? '' : 's'} shared with other uniques` })
      : null
  ]);
}
