import { el, fmt, compact, priceLabel, listingLabel, deltaEl, sparkline, section, statTile, barList } from '../util.js';
import { openDetail } from '../detail.js';
import { items, currency, rates, findCurrency, liquid, meaningful } from '../store.js';

/* Item classes come through as "Ezomyte One Hand Sword"; the culture prefix is
   flavour, not a slot, so strip it when grouping. */
const CULTURES = ['Ezomyte', 'Vaal', 'Kalguuran', 'Maraketh', 'Karui', 'Templar', 'Iron', 'Runic'];
const RUNE_PREFIX = /^(Runemastered|Runeforged)\s+/;

const median = (nums) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * The realm's small-change unit: Exalted in PoE2, Chaos in PoE1 — or Divine
 * itself on a league poe.ninja has not yet published rates for, since converting
 * by a rate of zero would report every figure as 0.
 */
const smallUnit = (r) => {
  const unit = r.secondary === 'chaos' ? { per: r.chaos, label: 'chaos' } : { per: r.exalted, label: 'ex' };
  return unit.per > 0 ? unit : { per: 1, label: 'div' };
};

const normaliseSlot = (slot) => {
  if (!slot) return 'Other';
  const words = slot.split(' ');
  return CULTURES.includes(words[0]) && words.length > 1 ? words.slice(1).join(' ') : slot;
};

export function renderStats() {
  const r = rates();
  const all = items();
  const cur = currency();
  const traded = liquid(all, 3);
  const page = el('div');

  const unit = smallUnit(r);
  const med = median(traded.map((i) => i.divine));
  const aboveDivine = all.filter((i) => i.divine >= 1);
  const mirror = findCurrency('Mirror of Kalandra');
  // PoE2 sells rune-socketed variants; PoE1 sells link counts. Same question.
  const variants = findVariantPairs(all);
  const variantPremium = median(variants.pairs.map((p) => p.premium));
  const mostListed = [...all].sort((a, b) => b.listings - a.listings)[0];

  page.append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Fun with numbers' }),
      el('p', {
        text: 'The economy sliced a few ways that the usual price lists never show you — scarcity, volatility, the cost of a rune, and what a Mirror is really worth.'
      })
    ])
  );

  /* ---- headline oddities ---- */
  page.append(
    el('div', { class: 'grid grid--4', style: 'margin-bottom:44px' }, [
      statTile('Median unique', fmt(med * unit.per), unit.label, 'half of all uniques cost less'),
      statTile(
        'Worth a Divine or more',
        String(aboveDivine.length),
        `/ ${all.length}`,
        `${((aboveDivine.length / Math.max(all.length, 1)) * 100).toFixed(1)}% of the unique pool`
      ),
      // Only meaningful where the realm actually has matched variants to compare.
      variants.pairs.length
        ? statTile(
            variants.label,
            `+${(variantPremium * 100).toFixed(0)}`,
            '%',
            `median uplift across ${variants.pairs.length} matched pairs`
          )
        : statTile(
            'Priced below a Chaos',
            String(all.filter((i) => i.divine * r.chaos < 1).length),
            'uniques',
            'the bottom of the market'
          ),
      statTile(
        'Most listed unique',
        listingLabel(mostListed?.listings ?? 0),
        'listings',
        mostListed?.name ?? ''
      )
    ])
  );

  /* ---- wealth pyramid ---- */
  const bands = [
    { label: '1,000+ div', test: (i) => i.divine >= 1000 },
    { label: '100 – 1,000 div', test: (i) => i.divine >= 100 && i.divine < 1000 },
    { label: '10 – 100 div', test: (i) => i.divine >= 10 && i.divine < 100 },
    { label: '1 – 10 div', test: (i) => i.divine >= 1 && i.divine < 10 },
    { label: `1 ${unit.label} – 1 div`, test: (i) => i.divine * unit.per >= 1 && i.divine < 1 },
    { label: `under 1 ${unit.label}`, test: (i) => i.divine * unit.per < 1 }
  ].map((b) => {
    const n = all.filter(b.test).length;
    return { label: b.label, value: n, display: `${n} · ${((n / all.length) * 100).toFixed(1)}%` };
  });

  page.append(
    section(
      'The wealth pyramid',
      'How the whole unique pool is distributed by price',
      el('div', { class: 'card' }, [barList(bands)])
    )
  );

  /* ---- a mirror buys you ---- */
  if (mirror) {
    // PoE1 lists hundreds of uniques at a divine value of zero; dividing by one
    // of those yields Infinity rather than a fun number.
    const cheapest = liquid(all, 10).filter((i) => i.divine > 0).sort((a, b) => a.divine - b.divine)[0];
    const conversions = [
      { label: 'Divine Orbs', value: mirror.divine },
      { label: 'Exalted Orbs', value: mirror.divine * r.exalted },
      { label: 'Chaos Orbs', value: mirror.divine * r.chaos },
      { label: 'median uniques', value: med ? mirror.divine / med : 0 },
      cheapest && { label: `copies of ${cheapest.name}`, value: mirror.divine / cheapest.divine }
    ].filter(Boolean);

    page.append(
      section(
        'One Mirror of Kalandra buys',
        `at today's rate of ${fmt(mirror.divine)} div`,
        el('div', { class: 'card' }, [
          el(
            'div',
            { class: 'rows' },
            conversions.map((c) =>
              el('div', { class: 'row' }, [
                el('div', { class: 'row__main' }, [el('div', { class: 'row__label', text: c.label })]),
                el('div', { class: 'price', text: compact(c.value) })
              ])
            )
          )
        ])
      )
    );
  }

  /* ---- kings of each slot ---- */
  const bySlot = new Map();
  for (const it of traded) {
    const slot = normaliseSlot(it.slot || it.category);
    const best = bySlot.get(slot);
    if (!best || it.divine > best.divine) bySlot.set(slot, it);
  }
  const kings = [...bySlot.entries()].sort((a, b) => b[1].divine - a[1].divine).slice(0, 12);

  page.append(
    section(
      'King of every slot',
      'The priciest unique you can equip in each item class',
      el('div', { class: 'card' }, [
        el(
          'div',
          { class: 'rows' },
          kings.map(([slot, it]) =>
            el('div', { class: 'row clickable', onclick: () => openDetail(it) }, [
              it.icon && el('img', { class: 'row__icon', src: it.icon, alt: '', loading: 'lazy' }),
              el('div', { class: 'row__main' }, [
                el('div', { class: 'row__label', text: it.name }),
                el('div', { class: 'row__sub', text: slot })
              ]),
              el('div', { class: 'price', text: priceLabel(it.divine, r) })
            ])
          )
        )
      ])
    )
  );

  /* ---- scarcity vs glut ---- */
  const scarce = all.filter((i) => i.divine >= 1).sort((a, b) => a.listings - b.listings).slice(0, 8);
  const flooded = [...all].sort((a, b) => b.listings - a.listings).slice(0, 8);

  page.append(
    section(
      'Scarcity and glut',
      'Supply extremes at both ends of the market',
      el('div', { class: 'grid grid--2' }, [
        listCard('Hardest to find', 'valuable uniques with the thinnest supply', scarce, r, (i) => `${listingLabel(i.listings)} listed`),
        listCard('Flooding the market', 'the most-listed uniques in the league', flooded, r, (i) => `${listingLabel(i.listings)} listed`)
      ])
    )
  );

  /* ---- volatility ---- */
  const volatile = [...traded, ...cur]
    .filter((x) => meaningful(x) && x.spark?.length > 2)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, 10);

  page.append(
    section(
      'Most volatile',
      'Biggest seven-day swing in either direction',
      el('div', { class: 'card' }, [
        el(
          'div',
          { class: 'rows' },
          volatile.map((x) =>
            el('div', { class: 'row clickable', onclick: () => openDetail(x) }, [
              x.icon && el('img', { class: 'row__icon', src: x.icon, alt: '', loading: 'lazy' }),
              el('div', { class: 'row__main' }, [
                el('div', { class: 'row__label', text: x.name }),
                el('div', { class: 'row__sub', text: x.baseType || x.category })
              ]),
              sparkline(x.spark, x.change),
              deltaEl(x.change)
            ])
          )
        )
      ])
    )
  );

  /* ---- the endgame tax ---- */
  const brackets = [
    { label: 'Level 1 – 20', min: 1, max: 20 },
    { label: 'Level 21 – 40', min: 21, max: 40 },
    { label: 'Level 41 – 60', min: 41, max: 60 },
    { label: 'Level 61 – 75', min: 61, max: 75 },
    { label: 'Level 76 – 90', min: 76, max: 90 }
  ]
    .map((b) => {
      const pool = traded.filter((i) => i.level >= b.min && i.level <= b.max);
      const m = median(pool.map((i) => i.divine)) * unit.per;
      return { label: b.label, value: m, display: pool.length ? `${fmt(m)} ${unit.label} · ${pool.length} items` : 'no data' };
    })
    .filter((b) => b.value > 0);

  page.append(
    section(
      'The endgame tax',
      'Median price by the level requirement of the item',
      el('div', { class: 'card' }, [barList(brackets)])
    )
  );

  /* ---- rune premium detail ---- */
  if (variants.pairs.length) {
    const topPairs = [...variants.pairs].sort((a, b) => b.premium - a.premium).slice(0, 8);
    page.append(
      section(
        variants.sectionTitle,
        'Rune-socketed variants against the plain version of the same unique',
        el('div', { class: 'card' }, [
          el(
            'div',
            { class: 'rows' },
            topPairs.map((p) =>
              el('div', { class: 'row clickable', onclick: () => openDetail(p.runed) }, [
                p.runed.icon && el('img', { class: 'row__icon', src: p.runed.icon, alt: '', loading: 'lazy' }),
                el('div', { class: 'row__main' }, [
                  el('div', { class: 'row__label', text: p.runed.name }),
                  el('div', { class: 'row__sub', text: p.runed.baseType })
                ]),
                el('div', { class: 'price__alt', text: `${priceLabel(p.plain.divine, r)} → ${priceLabel(p.runed.divine, r)}` }),
                el('span', { class: 'delta up', text: `+${(p.premium * 100).toFixed(0)}%` })
              ])
            )
          )
        ])
      )
    );
  }

  /* ---- closing flavour ---- */
  const flavoured = traded.find((i) => i.flavour);
  if (flavoured) {
    page.append(
      el('div', { class: 'card' }, [
        el('p', { class: 'card__title', text: `Flavour text of the ${fmt(flavoured.divine)} div ${flavoured.name}` }),
        el('p', { class: 'flavour', text: flavoured.flavour })
      ])
    );
  }

  return page;
}

function listCard(title, note, rows, r, subline) {
  return el('div', { class: 'card' }, [
    el('p', { class: 'card__title', text: title }),
    el('p', { style: 'margin:-8px 0 12px;font-size:12.5px;color:var(--faint)', text: note }),
    el(
      'div',
      { class: 'rows' },
      rows.length
        ? rows.map((i) =>
            el('div', { class: 'row clickable', onclick: () => openDetail(i) }, [
              i.icon && el('img', { class: 'row__icon', src: i.icon, alt: '', loading: 'lazy' }),
              el('div', { class: 'row__main' }, [
                el('div', { class: 'row__label', text: i.name }),
                el('div', { class: 'row__sub', text: subline(i) })
              ]),
              el('div', { class: 'price', text: priceLabel(i.divine, r) })
            ])
          )
        : el('div', { class: 'empty', text: 'Not enough data.' })
    )
  ]);
}

/**
 * Matches "Temporalis / Runemastered Silk Robe" to "Temporalis / Silk Robe" so we
 * can price what the rune sockets themselves add.
 *
 * The plain half has to be worth something first: hundreds of uniques sit at the
 * 1-Exalted price floor, and dividing a 300 div runed version by that floor
 * produces a meaningless five-digit "premium".
 */
const PRICE_FLOOR = 0.05; // below this the average is just the price floor

/** Both halves of a comparison have to be real markets for the ratio to mean anything. */
const comparable = (a, b) =>
  a.divine >= PRICE_FLOOR && b.divine >= PRICE_FLOOR && a.listings >= 5 && b.listings >= 5;

/**
 * "What does the upgraded version cost over the plain one?" — the same question
 * in both games, asked of whatever that game upgrades.
 *
 * PoE2 sells rune-socketed variants of a unique alongside the plain one. PoE1
 * sells the same unique at different link counts. Either way the plain half has
 * to be worth something first: hundreds of uniques sit at the price floor, and
 * dividing an expensive variant by that floor invents a five-digit "premium".
 */
function findVariantPairs(all) {
  const runed = all.filter((it) => RUNE_PREFIX.test(it.baseType));
  if (runed.length) {
    const plain = new Map();
    for (const it of all) if (!RUNE_PREFIX.test(it.baseType)) plain.set(`${it.name}|${it.baseType}`, it);

    const pairs = [];
    for (const it of runed) {
      const base = plain.get(`${it.name}|${it.baseType.replace(RUNE_PREFIX, '')}`);
      if (!base || !comparable(it, base)) continue;
      const premium = it.divine / base.divine - 1;
      if (premium > 0) pairs.push({ runed: it, plain: base, premium });
    }
    return { pairs, label: 'Rune-socketed premium', sectionTitle: 'What a rune is worth' };
  }

  // PoE1: compare a unique's six-link against the same unique unlinked. The feed
  // can list several entries per link count at wildly different prices, so take
  // the best-supplied one of each rather than whichever happens to come first.
  const groups = new Map();
  for (const it of all) {
    const key = `${it.name}|${it.baseType}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  }

  const pairs = [];
  for (const group of groups.values()) {
    const best = (test) =>
      group.filter(test).sort((a, b) => b.listings - a.listings)[0];
    const linked = best((i) => i.links === 6);
    const bare = best((i) => !i.links);
    if (!linked || !bare || !comparable(linked, bare)) continue;
    const premium = linked.divine / bare.divine - 1;
    if (premium > 0) pairs.push({ runed: linked, plain: bare, premium });
  }
  return { pairs, label: 'Six-link premium', sectionTitle: 'What a six-link is worth' };
}
