import { el, fmt, priceCell, deltaEl, sparkline, itemCell, searchIcon, unitName } from '../util.js';
import { createTable } from '../table.js';
import { openDetail } from '../detail.js';
import { currency, rates } from '../store.js';

export function renderCurrency() {
  const r = rates();
  const all = currency();
  const categories = [...new Set(all.map((c) => c.category))];
  const filters = { query: '', category: 'All' };

  const page = el('div');
  page.append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Currency exchange' }),
      el('p', {
        text: `Orbs, runes, essences, omens and everything else players trade in bulk. "Traded" is the total value that changed hands this week, in ${unitName(r)}.`
      })
    ])
  );

  const count = el('span', { class: 'count' });

  const controls = el('div', { class: 'controls' }, [
    el('label', { class: 'search' }, [
      el('span', { class: 'sr-only', text: 'Search currency' }),
      searchIcon(),
      el('input', {
        type: 'search',
        placeholder: 'Search currency…',
        oninput: (e) => {
          filters.query = e.target.value.trim().toLowerCase();
          apply();
        }
      })
    ]),
    el('div', { class: 'chips' },
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
    ),
    el('span', { class: 'spacer' }),
    count
  ]);

  page.append(controls);

  const table = createTable({
    columns: [
      { key: 'rank', label: '#', sortable: false, render: (_, i) => el('span', { class: 'rank', text: i + 1 }) },
      { key: 'name', label: 'Currency', value: (x) => x.name, render: (x) => itemCell(x, { plain: true }) },
      {
        key: 'category',
        label: 'Group',
        hide: true,
        value: (x) => x.category,
        render: (x) => el('span', { class: 'tag', text: x.category })
      },
      {
        key: 'volumeDivine',
        label: 'Traded',
        align: 'right',
        hide: true,
        render: (x) => el('span', { class: 'num', text: fmt(x.volumeDivine) })
      },
      {
        key: 'pair',
        label: 'Deepest pair',
        align: 'right',
        hide: true,
        sortable: false,
        render: (x) =>
          x.volumeCurrency
            ? el('span', { class: 'price__alt', text: `${fmt(x.volumeRate)} / ${x.volumeCurrency}` })
            : el('span', { class: 'price__alt', text: '—' })
      },
      { key: 'spark', label: 'Trend', sortable: false, hide: true, render: (x) => sparkline(x.spark, x.change) },
      { key: 'change', label: '7 days', align: 'right', render: (x) => deltaEl(x.change) },
      { key: 'divine', label: 'Price', align: 'right', render: (x) => priceCell(x.divine, r) }
    ],
    rows: [],
    sortKey: 'divine',
    onRow: openDetail,
    limit: 400
  });

  page.append(table);

  function apply() {
    const rows = all.filter((c) => {
      if (filters.category !== 'All' && c.category !== filters.category) return false;
      if (!filters.query) return true;
      return c.name.toLowerCase().includes(filters.query);
    });
    count.textContent = `${rows.length} entries`;
    table.update(rows);
  }

  apply();
  return page;
}
