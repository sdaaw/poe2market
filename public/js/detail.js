import { el, clear, fmt, compact, listingLabel, deltaEl, sparkline } from './util.js';
import { rates } from './store.js';

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
}
