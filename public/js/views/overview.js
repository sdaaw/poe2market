import { el, clear, fmt, compact, priceLabel, priceCell, listingLabel, deltaEl, sparkline, itemCell, section, statTile, unitName } from '../util.js';
import { createTable } from '../table.js';
import { openDetail } from '../detail.js';
import { items, currency, rates, findCurrency, liquid, meaningful } from '../store.js';
import { loadHistory } from '../history.js';
import { movementSince, markSeen } from '../sincelast.js';

export function renderOverview() {
  const r = rates();
  const all = items();
  const cur = currency();
  const tradeable = liquid(all, 3);
  const top = tradeable.slice(0, 12);

  const mirror = findCurrency('Mirror of Kalandra');
  const turnover = cur.reduce((sum, c) => sum + (c.volumeDivine ?? 0), 0);

  const page = el('div');

  // Filled asynchronously; stays empty and invisible when there is nothing new.
  const sinceSlot = el('div');
  renderSinceLast(sinceSlot);

  page.append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'The state of the economy' }),
      el('p', {
        text: `Every price below is a league-wide average from poe.ninja, quoted in ${unitName(r)}. Click any row to see the full item.`
      })
    ]),
    sinceSlot
  );

  /* ---- headline numbers ---- */
  page.append(
    el('div', { class: 'grid grid--4', style: 'margin-bottom:44px' }, [
      // Until a league trades its first Divine Orb there is no rate to show, and
      // "0 ex" would read as a price rather than an absence.
      r.exalted > 0
        ? statTile('Divine Orb', fmt(r.exalted), 'ex', `also worth ${fmt(r.chaos)} chaos`)
        : statTile('Divine Orb', '—', '', 'not traded yet'),
      statTile(
        'Mirror of Kalandra',
        mirror ? fmt(mirror.divine) : '—',
        r.base,
        mirror ? `${mirror.change > 0 ? '+' : ''}${mirror.change.toFixed(1)}% over 7 days` : 'not traded'
      ),
      statTile(
        'Priciest unique',
        top[0] ? fmt(top[0].divine) : '—',
        r.base,
        top[0] ? top[0].name : ''
      ),
      statTile('Weekly turnover', compact(turnover), r.base, 'across every tracked currency market')
    ])
  );

  /* ---- podium ---- */
  if (top.length >= 3) {
    page.append(
      section(
        'The chase list',
        'Most expensive uniques with at least three active listings',
        el('div', {}, [
          el(
            'div',
            { class: 'podium' },
            top.slice(0, 3).map((it, i) =>
              el('div', { class: 'podium__card', onclick: () => openDetail(it) }, [
                el('div', { class: 'podium__rank', text: `#${i + 1}` }),
                it.icon && el('img', { class: 'podium__icon', src: it.icon, alt: '', loading: 'lazy' }),
                el('div', { class: 'podium__name', text: it.name }),
                el('div', { class: 'podium__base', text: it.baseType }),
                el('div', { class: 'podium__price', text: `${fmt(it.divine)} ${r.base}` }),
                el('div', { class: 'podium__base', text: `${listingLabel(it.listings)} listed` })
              ])
            )
          ),
          topTable(top.slice(3), r)
        ])
      )
    );
  }

  /* ---- movers ---- */
  const movable = [...tradeable, ...cur].filter(
    (x) => meaningful(x) && x.spark?.length > 2 && Math.abs(x.change) > 0.5
  );
  const gainers = [...movable].sort((a, b) => b.change - a.change).slice(0, 7);
  const losers = [...movable].sort((a, b) => a.change - b.change).slice(0, 7);

  page.append(
    section(
      'Seven days of movement',
      'Sharpest price swings across uniques and currency',
      el('div', { class: 'grid grid--2' }, [
        moverCard('Climbing', gainers, r),
        moverCard('Sliding', losers, r)
      ])
    )
  );

  /* ---- busiest markets ---- */
  const busiest = [...cur].sort((a, b) => b.volumeDivine - a.volumeDivine).slice(0, 8);
  page.append(
    section(
      'Where the money moves',
      'Currencies by total value traded this week',
      el('div', { class: 'card' }, [
        el(
          'div',
          { class: 'rows' },
          busiest.map((c) =>
            el('div', { class: 'row clickable', onclick: () => openDetail(c) }, [
              c.icon && el('img', { class: 'row__icon', src: c.icon, alt: '', loading: 'lazy' }),
              el('div', { class: 'row__main' }, [
                el('div', { class: 'row__label', text: c.name }),
                el('div', { class: 'row__sub', text: `${fmt(c.volumeDivine)} ${r.base} traded` })
              ]),
              el('div', { class: 'price', text: priceLabel(c.divine, r) }),
              deltaEl(c.change)
            ])
          )
        )
      ])
    )
  );

  return page;
}

function topTable(rows, r) {
  return createTable({
    columns: [
      { key: 'rank', label: '', sortable: false, render: (_, i) => el('span', { class: 'rank', text: `#${i + 4}` }) },
      { key: 'name', label: 'Item', value: (x) => x.name, render: (x) => itemCell(x) },
      { key: 'slot', label: 'Slot', hide: true, value: (x) => x.slot, render: (x) => el('span', { class: 'tag', text: x.slot || '—' }) },
      { key: 'listings', label: 'Listed', align: 'right', hide: true, render: (x) => el('span', { class: 'num', text: listingLabel(x.listings) }) },
      { key: 'change', label: '7 days', align: 'right', hide: true, render: (x) => deltaEl(x.change) },
      { key: 'divine', label: 'Price', align: 'right', render: (x) => priceCell(x.divine, r) }
    ],
    rows,
    sortKey: 'divine',
    onRow: openDetail,
    limit: 9
  });
}

function moverCard(title, rows, r) {
  return el('div', { class: 'card' }, [
    el('p', { class: 'card__title', text: title }),
    el(
      'div',
      { class: 'rows' },
      rows.length
        ? rows.map((x) =>
            el('div', { class: 'row clickable', onclick: () => openDetail(x) }, [
              x.icon && el('img', { class: 'row__icon', src: x.icon, alt: '', loading: 'lazy' }),
              el('div', { class: 'row__main' }, [
                el('div', { class: 'row__label', text: x.name }),
                el('div', { class: 'row__sub', text: x.baseType || x.category })
              ]),
              sparkline(x.spark, x.change),
              el('div', { class: 'price', text: priceLabel(x.divine, r) }),
              deltaEl(x.change)
            ])
          )
        : el('div', { class: 'empty', text: 'No meaningful movement.' })
    )
  ]);
}

/**
 * "Since you were last here" — filled in once the history file arrives, and only
 * when it has something to report.
 */
async function renderSinceLast(slot) {
  const history = await loadHistory();
  if (!history) return;

  const report = movementSince(history);
  if (!report) return;

  // First visit has no baseline; note where they came in and stay quiet.
  if (report.firstVisit) {
    markSeen(report.latest);
    return;
  }
  if (!report.movers.length) {
    markSeen(report.latest);
    return;
  }

  const r = rates();
  const SHOWN = 8;
  const { movers, days } = report;
  const up = movers.filter((m) => m.change > 0).length;

  clear(slot).append(
    el('div', { class: 'since' }, [
      el('div', { class: 'since__head' }, [
        el('div', {}, [
          el('h2', { class: 'since__title', text: 'While you were away' }),
          el('p', {
            class: 'since__sub',
            text: `${movers.length} market${movers.length === 1 ? '' : 's'} moved more than ${Math.round(report.threshold)}% over the last ${days} day${days === 1 ? '' : 's'} — ${up} up, ${movers.length - up} down.`
          })
        ]),
        el('button', {
          class: 'since__dismiss',
          type: 'button',
          text: 'Mark as seen',
          onclick: () => {
            markSeen(report.latest);
            slot.remove();
          }
        })
      ]),
      el('div', { class: 'since__rows' }, movers.slice(0, SHOWN).map((m) =>
        el('div', { class: 'row clickable', onclick: () => openDetail(m.entry) }, [
          m.entry.icon && el('img', { class: 'row__icon', src: m.entry.icon, alt: '', loading: 'lazy' }),
          el('div', { class: 'row__main' }, [
            el('div', { class: 'row__label', text: m.entry.name }),
            el('div', { class: 'row__sub', text: m.entry.baseType || m.entry.category })
          ]),
          el('div', { class: 'price__alt', text: `${priceLabel(m.before, r)} → ${priceLabel(m.now, r)}` }),
          deltaEl(m.change)
        ])
      )),
      movers.length > SHOWN
        ? el('p', { class: 'since__more', text: `+${movers.length - SHOWN} more` })
        : null
    ])
  );
}
