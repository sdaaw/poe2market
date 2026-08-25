/* Small DOM + formatting helpers. No framework, no build step. */

/** el('div', {class:'x'}, [child, 'text']) -> HTMLElement */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* ---------- numbers ---------- */

/** Adaptive precision: big numbers stay readable, tiny ones keep their signal. */
export function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1000) return Math.round(n).toLocaleString('en-US');
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1);
  if (abs >= 1) return n.toFixed(2);
  if (abs >= 0.01) return n.toFixed(3);
  if (abs === 0) return '0';
  return n.toPrecision(2);
}

export function compact(n) {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}

/**
 * Prices are stored in Divine Orbs. Anything under a Divine reads better in
 * Exalted, which is how players actually quote cheap items. Past ~10 Divine the
 * Exalted equivalent runs into the hundreds of thousands, so we drop it.
 */
export function price(divine, rates) {
  const unit = rates?.secondary ?? 'ex';
  const small = divine * ((unit === 'chaos' ? rates?.chaos : rates?.exalted) ?? 0);
  if (divine >= 1) {
    return { value: fmt(divine), unit: 'div', alt: divine < 10 ? `${fmt(small)} ${unit}` : null };
  }
  return { value: fmt(small), unit, alt: null };
}

export function priceCell(divine, rates) {
  const p = price(divine, rates);
  return el('div', {}, [
    el('div', { class: 'price' }, [p.value, el('small', { text: p.unit })]),
    p.alt && el('div', { class: 'price__alt', text: p.alt })
  ]);
}

export function deltaEl(change) {
  const dir = change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'flat';
  const sign = change > 0 ? '+' : '';
  return el('span', {
    class: `delta ${dir}`,
    text: dir === 'flat' ? '—' : `${sign}${change.toFixed(1)}%`
  });
}

/* ---------- sparkline ---------- */

const SVG = 'http://www.w3.org/2000/svg';

/** 7-day trend line. Data points are cumulative percentage changes. */
export function sparkline(data, change) {
  const w = 72;
  const h = 22;
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');

  const pts = (data ?? []).filter(Number.isFinite);
  if (pts.length < 2) return svg;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const pad = 2;
  const coords = pts.map((v, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - pad - ((v - min) / span) * (h - pad * 2);
    return [x, y];
  });

  const color =
    change > 0.5 ? 'var(--up)' : change < -0.5 ? 'var(--down)' : 'var(--faint)';

  const area = document.createElementNS(SVG, 'path');
  area.setAttribute(
    'd',
    `M0,${h} ${coords.map(([x, y]) => `L${x.toFixed(1)},${y.toFixed(1)}`).join(' ')} L${w},${h} Z`
  );
  area.setAttribute('fill', color);
  area.setAttribute('opacity', '.10');

  const line = document.createElementNS(SVG, 'polyline');
  line.setAttribute('points', coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '1.5');
  line.setAttribute('stroke-linejoin', 'round');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('vector-effect', 'non-scaling-stroke');

  svg.append(area, line);
  return svg;
}

/* ---------- shared fragments ---------- */

export function itemCell(entry, { plain = false, note = null, tag = null } = {}) {
  return el('div', { class: 'item' }, [
    entry.icon &&
      el('img', {
        class: 'item__icon',
        src: entry.icon,
        alt: '',
        loading: 'lazy',
        onerror(e) {
          e.target.style.visibility = 'hidden';
        }
      }),
    el('div', { class: 'item__text' }, [
      el('div', { class: `item__name${plain ? ' plain' : ''}`, text: entry.name }),
      (entry.baseType || entry.slot || entry.category) &&
        el('div', { class: 'item__base' }, [
          entry.baseType || entry.slot || entry.category,
          // PoE1 lists one row per rolled combination; without the roll's name
          // those rows look identical.
          tag && el('span', { class: 'item__variant', text: tag })
        ]),
      note
    ])
  ]);
}

/**
 * Text with every occurrence of `query` wrapped in <mark>.
 *
 * Built from nodes rather than innerHTML: the query is whatever the user typed,
 * and item text comes from an upstream feed.
 */
export function highlight(text, query) {
  const frag = document.createDocumentFragment();
  if (!query) {
    frag.append(text);
    return frag;
  }

  const haystack = text.toLowerCase();
  const needle = query.toLowerCase();
  let at = 0;

  for (;;) {
    const hit = haystack.indexOf(needle, at);
    if (hit === -1) break;
    if (hit > at) frag.append(text.slice(at, hit));
    frag.append(el('mark', { text: text.slice(hit, hit + needle.length) }));
    at = hit + needle.length;
  }
  frag.append(text.slice(at));
  return frag;
}

export function section(title, note, body) {
  return el('section', { class: 'section' }, [
    el('div', { class: 'section__head' }, [
      el('h2', { text: title }),
      note && el('p', { text: note })
    ]),
    body
  ]);
}

export function statTile(label, value, unit, sub) {
  return el('div', { class: 'card' }, [
    el('div', { class: 'stat' }, [
      el('div', { class: 'stat__label', text: label }),
      el('div', { class: 'stat__value' }, [value, unit && el('small', { text: unit })]),
      sub && el('div', { class: 'stat__sub', text: sub })
    ])
  ]);
}

export function barList(entries, { unit = '' } = {}) {
  const max = Math.max(...entries.map((e) => e.value), 1);
  return el(
    'div',
    { class: 'bars' },
    entries.map((e) =>
      el('div', {}, [
        el('div', { class: 'bar__top' }, [
          el('span', { text: e.label }),
          el('span', { text: e.display ?? `${fmt(e.value)}${unit}` })
        ]),
        el('div', { class: 'bar__track' }, [
          el('div', {
            class: 'bar__fill',
            style: `width:${Math.max(1.5, (e.value / max) * 100)}%${e.color ? `;background:${e.color}` : ''}`
          })
        ])
      ])
    )
  );
}

/** Magnifier glyph for search inputs. */
export function searchIcon() {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const c = document.createElementNS(SVG, 'circle');
  c.setAttribute('cx', '11'); c.setAttribute('cy', '11'); c.setAttribute('r', '7');
  c.setAttribute('fill', 'none');
  const l = document.createElementNS(SVG, 'path');
  l.setAttribute('d', 'M20 20l-3.5-3.5');
  svg.append(c, l);
  return svg;
}

/** "3,820 div" / "45 ex" as one string, for tight single-line rows. */
export function priceLabel(divine, rates) {
  const p = price(divine, rates);
  return `${p.value} ${p.unit}`;
}

/** poe.ninja clamps listing counts at 10,000, so say so rather than implying exactness. */
export function listingLabel(n) {
  if (!Number.isFinite(n)) return '—';
  return n >= 10000 ? '10k+' : n.toLocaleString('en-US');
}

/** "4 minutes ago" — the site's data is only as fresh as the last scheduled build. */
export function timeAgo(iso) {
  if (!iso) return '';
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (!Number.isFinite(secs)) return '';
  if (secs < 90) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
