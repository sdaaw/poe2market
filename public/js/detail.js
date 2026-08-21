import { el, clear, fmt, compact, listingLabel, deltaEl, sparkline } from './util.js';
import { rates, slugFor } from './store.js';
import { goToItem, leaveItem } from './router.js';
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

/** Hides the panel without touching the URL — for the router to call. */
export function hideDetail() {
  drawer.hidden = true;
}

/** A reader dismissing the panel: navigate, and let the router do the hiding. */
export function closeDetail() {
  if (drawer.hidden) return;
  leaveItem();
}

function modBlock(title, list, className) {
  if (!list?.length) return null;
  return el('div', {}, [
    title && el('p', { class: 'mods__title', text: title }),
    el('ul', { class: `mods ${className}` }, list.map((t) => el('li', { text: t })))
  ]);
}

/**
 * Opening an item is a navigation, so it lands in history and can be linked.
 * The router calls showDetail once the URL settles; if the URL already points
 * here (a re-click) there is no hashchange to wait for, so render now.
 */
export function openDetail(entry) {
  if (!goToItem(slugFor(entry))) showDetail(entry);
}

/** Side panel with the full item card: prices, mods, trend and flavour text. */
export function showDetail(entry) {
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

/* ---------- copy link ---------- */

const copyBtn = document.getElementById('copy-link');
let copyReset = null;

/**
 * The async clipboard API needs a secure context and an unblocked permission,
 * and quietly rejects otherwise. Falling back to a throwaway textarea keeps the
 * button working rather than telling the reader to do it by hand.
 */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // fall through
  }

  const scratch = el('textarea', { value: text, 'aria-hidden': 'true' });
  scratch.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.append(scratch);
  scratch.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  scratch.remove();
  return ok;
}

copyBtn.addEventListener('click', async () => {
  const ok = await copyText(location.href);
  copyBtn.classList.toggle('is-done', ok);
  copyBtn.title = ok ? 'Link copied' : 'Could not copy — use the address bar';

  clearTimeout(copyReset);
  copyReset = setTimeout(() => {
    copyBtn.classList.remove('is-done');
    copyBtn.title = 'Copy link to this item';
  }, 1600);
});
