import { el, clear, fmt, compact, listingLabel, deltaEl, sparkline } from './util.js';
import { rates } from './store.js';
import { loadHistory, seriesFor, daysRecorded } from './history.js';
import { priceChart, chartSummary } from './chart.js';

const drawer = document.getElementById('drawer');
const body = document.getElementById('drawer-body');

drawer.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeDetail();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDetail();
});

export function closeDetail() {
  drawer.hidden = true;
}

function modBlock(title, list, className) {
  if (!list?.length) return null;
  return el('div', {}, [
    title && el('p', { class: 'mods__title', text: title }),
    el('ul', { class: `mods ${className}` }, list.map((t) => el('li', { text: t })))
  ]);
}

/** Side panel with the full item card: prices, mods, trend and flavour text. */
export function openDetail(entry) {
  const r = rates();
  const ex = entry.divine * r.exalted;
  const chaos = entry.divine * r.chaos;

  const slot = el('div', { class: 'history' });

  // Node.append() turns a null into the literal text "null", so filter first.
  const blocks = [
    el('div', { class: 'detail__head' }, [
      entry.icon && el('img', { class: 'detail__icon', src: entry.icon, alt: '' }),
      el('div', {}, [
        el('div', { class: 'detail__name', text: entry.name }),
        el('div', { class: 'detail__base', text: entry.baseType || entry.slot || entry.category })
      ])
    ]),

    el('div', { class: 'detail__prices' }, [
      el('div', {}, [
        el('div', { class: 'detail__price-label', text: 'Divine' }),
        el('div', { class: 'detail__price-value', text: fmt(entry.divine) })
      ]),
      el('div', {}, [
        el('div', { class: 'detail__price-label', text: 'Exalted' }),
        el('div', { class: 'detail__price-value', text: ex >= 10000 ? compact(ex) : fmt(ex) })
      ]),
      el('div', {}, [
        el('div', { class: 'detail__price-label', text: 'Chaos' }),
        el('div', { class: 'detail__price-value', text: chaos >= 10000 ? compact(chaos) : fmt(chaos) })
      ])
    ]),

    slot,

    el('div', { class: 'row' }, [
      el('div', { class: 'row__main' }, [
        el('div', { class: 'row__label', text: '7-day trend' }),
        el('div', { class: 'row__sub', text: entry.kind === 'item' ? `${listingLabel(entry.listings ?? 0)} listings` : entry.category })
      ]),
      sparkline(entry.spark, entry.change),
      deltaEl(entry.change ?? 0)
    ]),

    entry.level
      ? el('div', { class: 'row' }, [
          el('div', { class: 'row__main' }, [el('div', { class: 'row__label', text: 'Level requirement' })]),
          el('span', { class: 'num', text: entry.level })
        ])
      : null,

    entry.corrupted
      ? el('div', { class: 'row' }, [
          el('div', { class: 'row__main' }, [el('div', { class: 'row__label', text: 'Corrupted' })]),
          el('span', { class: 'tag', text: 'Yes' })
        ])
      : null,

    el('div', { style: 'margin-top:20px' }, [
      modBlock(null, entry.properties, 'props'),
      modBlock(null, entry.requirements, 'reqs'),
      modBlock('Implicit', entry.implicit, 'implicit'),
      modBlock('Modifiers', entry.explicit, ''),
      modBlock('Grants', entry.granted, 'granted')
    ]),

    entry.flavour ? el('p', { class: 'flavour', text: entry.flavour }) : null
  ];

  clear(body).append(...blocks.filter(Boolean));
  drawer.hidden = false;

  // History is a separate download, so the panel opens immediately and the chart
  // fills in behind it.
  renderHistory(slot, entry);
}

/**
 * Fills the history slot once the (lazily fetched) history file arrives.
 *
 * Early in a league there is barely anything recorded, so rather than draw a
 * misleading two-point line we say plainly how much has been collected so far.
 */
let historyToken = 0;

async function renderHistory(slot, entry) {
  const token = ++historyToken;
  const history = await loadHistory();
  if (token !== historyToken) return; // a different item was opened meanwhile

  if (!history) return;

  const series = seriesFor(history, entry.key);
  if (!series) {
    const days = daysRecorded(history);
    clear(slot).append(
      el('div', { class: 'history__pending' }, [
        el('span', { text: days <= 1 ? 'Price history starts building today.' : `Collecting price history — ${days} days so far.` })
      ])
    );
    return;
  }

  const s = chartSummary(series);
  const dir = s.change > 0.5 ? 'up' : s.change < -0.5 ? 'down' : 'flat';

  clear(slot).append(
    el('div', { class: 'history__head' }, [
      el('span', { class: 'history__title', text: `Since ${s.from}` }),
      el('span', {
        class: `delta ${dir}`,
        text: dir === 'flat' ? '—' : `${s.change > 0 ? '+' : ''}${s.change.toFixed(1)}%`
      })
    ]),
    priceChart(series),
    el('div', { class: 'history__foot' }, [
      el('span', { text: `low ${s.low}` }),
      el('span', { text: `${s.days} days` }),
      el('span', { text: `high ${s.high}` })
    ])
  );
}
