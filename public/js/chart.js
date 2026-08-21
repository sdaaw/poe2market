/**
 * A small SVG line chart for price history.
 *
 * Sized in a fixed viewBox and stretched to the container, so it stays sharp at
 * any width without measuring anything or re-rendering on resize.
 */
import { fmt } from './util.js';

const SVG = 'http://www.w3.org/2000/svg';
const W = 320;
const H = 108;
const PAD = { top: 12, right: 8, bottom: 18, left: 8 };

const node = (name, attrs = {}) => {
  const n = document.createElementNS(SVG, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/**
 * `dates` and `values` are positionally aligned; values may contain nulls for
 * days with no reading, which are drawn as gaps rather than invented points.
 */
export function priceChart({ dates, values }) {
  const svg = node('svg', {
    class: 'chart',
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: 'none',
    role: 'img',
    'aria-label': `Price history, ${dates[0]} to ${dates[dates.length - 1]}`
  });

  const points = values
    .map((v, i) => ({ v, i }))
    .filter((p) => p.v !== null && Number.isFinite(p.v));
  if (points.length < 2) return svg;

  const lo = Math.min(...points.map((p) => p.v));
  const hi = Math.max(...points.map((p) => p.v));
  const span = hi - lo || hi || 1;

  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (values.length === 1 ? 0 : (i / (values.length - 1)) * plotW);
  const y = (v) => PAD.top + plotH - ((v - lo) / span) * plotH;

  const last = points[points.length - 1];
  const first = points[0];
  const rising = last.v >= first.v;
  const colour = rising ? 'var(--up)' : 'var(--down)';

  // Baseline at the starting price, so the shape reads as "since then".
  svg.append(
    node('line', {
      x1: PAD.left, x2: W - PAD.right,
      y1: y(first.v).toFixed(1), y2: y(first.v).toFixed(1),
      stroke: 'var(--line)', 'stroke-width': 1, 'stroke-dasharray': '3 3',
      'vector-effect': 'non-scaling-stroke'
    })
  );

  // Split into runs of consecutive readings so gaps stay gaps.
  const runs = [];
  let run = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i] === null || !Number.isFinite(values[i])) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push({ v: values[i], i });
    }
  }
  if (run.length) runs.push(run);

  for (const r of runs) {
    if (r.length === 1) {
      svg.append(node('circle', { cx: x(r[0].i).toFixed(1), cy: y(r[0].v).toFixed(1), r: 1.6, fill: colour }));
      continue;
    }
    const d = r.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
    svg.append(
      node('polyline', {
        points: d, fill: 'none', stroke: colour,
        'stroke-width': 1.75, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        'vector-effect': 'non-scaling-stroke'
      })
    );
  }

  // Marker on the latest reading.
  svg.append(
    node('circle', { cx: x(last.i).toFixed(1), cy: y(last.v).toFixed(1), r: 2.6, fill: colour }),
    node('circle', {
      cx: x(last.i).toFixed(1), cy: y(last.v).toFixed(1), r: 5,
      fill: colour, opacity: '.18'
    })
  );

  return svg;
}

/** High / low / change summary that sits under the chart. */
export function chartSummary({ dates, values }) {
  const points = values.filter((v) => v !== null && Number.isFinite(v));
  const first = points[0];
  const last = points[points.length - 1];
  const change = first > 0 ? ((last - first) / first) * 100 : 0;

  return {
    low: fmt(Math.min(...points)),
    high: fmt(Math.max(...points)),
    change,
    from: shortDate(dates[0]),
    to: shortDate(dates[dates.length - 1]),
    days: dates.length
  };
}
