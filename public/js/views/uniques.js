import { el, priceCell, listingLabel, deltaEl, sparkline, itemCell, searchIcon } from '../util.js';
import { createTable } from '../table.js';
import { openDetail } from '../detail.js';
import { items, rates } from '../store.js';

const CATEGORY_ORDER = [
  'Weapons', 'Armour', 'Accessories', 'Jewels', 'Flasks',
  'Charms', 'Relics', 'Tablets', 'Precursor Tablets'
];

const MIN_LISTINGS = [
  { label: 'All listings', value: 0 },
  { label: '3+ listed', value: 3 },
  { label: '10+ listed', value: 10 }
];

export function renderUniques() {
  const r = rates();
  const all = items();

  const categories = CATEGORY_ORDER.filter((c) => all.some((i) => i.category === c));
  const filters = { query: '', category: 'All', minListings: 3 };

  const page = el('div');
  page.append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Unique items' }),
      el('p', {
        text: `${all.length} uniques tracked across ${categories.length} categories. Sort by any column; click a row for the full item card.`
      })
    ])
  );

  const count = el('span', { class: 'count' });

  const searchBox = el('label', { class: 'search' }, [
    el('span', { class: 'sr-only', text: 'Search uniques' }),
    searchIcon(),
    el('input', {
      type: 'search',
      placeholder: 'Search by name or base type…',
      oninput: (e) => {
        filters.query = e.target.value.trim().toLowerCase();
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

  page.append(
    el('div', { class: 'controls' }, [searchBox, catChips, el('span', { class: 'spacer' }), listingChips, count])
  );

  const table = createTable({
    columns: [
      { key: 'rank', label: '#', sortable: false, render: (_, i) => el('span', { class: 'rank', text: i + 1 }) },
      { key: 'name', label: 'Item', value: (x) => x.name, render: (x) => itemCell(x) },
      {
        key: 'slot',
        label: 'Slot',
        hide: true,
        value: (x) => x.slot || x.category,
        render: (x) => el('span', { class: 'tag', text: x.slot || x.category })
      },
      { key: 'level', label: 'Lvl', align: 'right', hide: true, render: (x) => el('span', { class: 'num', text: x.level || '—' }) },
      { key: 'listings', label: 'Listed', align: 'right', render: (x) => el('span', { class: 'num', text: listingLabel(x.listings) }) },
      { key: 'spark', label: 'Trend', sortable: false, hide: true, render: (x) => sparkline(x.spark, x.change) },
      { key: 'change', label: '7 days', align: 'right', render: (x) => deltaEl(x.change) },
      { key: 'divine', label: 'Price', align: 'right', render: (x) => priceCell(x.divine, r) }
    ],
    rows: [],
    sortKey: 'divine',
    onRow: openDetail,
    limit: 300
  });

  page.append(table);

  function apply() {
    const rows = all.filter((it) => {
      if (filters.category !== 'All' && it.category !== filters.category) return false;
      if ((it.listings ?? 0) < filters.minListings) return false;
      if (!filters.query) return true;
      return (
        it.name.toLowerCase().includes(filters.query) ||
        it.baseType.toLowerCase().includes(filters.query) ||
        (it.slot || '').toLowerCase().includes(filters.query)
      );
    });
    count.textContent = `${rows.length} items`;
    table.update(rows);
  }

  apply();
  return page;
}

