import { el, clear, compact } from './util.js';
import { analyseContent, explain, PROFILE_NOTES } from './analysis.js';
import { currency } from './store.js';

/**
 * The small "what should I farm" chip in the header, plus the panel it opens.
 *
 * Opens on hover for the quick look, and pins open on click so the numbers can
 * actually be read on a touch screen.
 */
export function mountInsight(host) {
  let pinned = false;
  let hideTimer = null;

  const chip = el('button', {
    class: 'insight__chip',
    type: 'button',
    'aria-expanded': 'false',
    'aria-haspopup': 'dialog'
  });

  const panel = el('div', { class: 'insight__panel', role: 'dialog', 'aria-label': 'Content analysis', hidden: true });

  const open = () => {
    clearTimeout(hideTimer);
    panel.hidden = false;
    chip.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    if (pinned) return;
    panel.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
  };
  const closeNow = () => {
    pinned = false;
    close();
  };

  chip.addEventListener('click', () => {
    pinned = !pinned;
    if (pinned) open();
    else closeNow();
  });
  chip.addEventListener('pointerenter', open);
  chip.addEventListener('focus', open);
  host.addEventListener('pointerleave', () => {
    hideTimer = setTimeout(close, 120);
  });
  panel.addEventListener('pointerenter', open);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNow();
  });
  document.addEventListener('click', (e) => {
    if (!host.contains(e.target)) closeNow();
  });

  host.append(chip, panel);

  return function update() {
    const rows = analyseContent(currency());

    if (rows.length < 3) {
      host.hidden = true;
      return;
    }
    host.hidden = false;

    const best = rows[0];
    clear(chip).append(
      el('span', { class: 'insight__dot' }),
      // Dropped on narrow screens so the chip stops crowding the tabs.
      el('span', { class: 'insight__label', text: 'Best market:' }),
      el('b', { text: best.name }),
      el('span', { class: 'insight__caret', text: '?' })
    );

    clear(panel).append(
      el('div', { class: 'insight__head' }, [
        el('h3', { text: 'Where the money actually is' })
      ]),

      el('div', { class: 'insight__legend' }, [
        el('span', {}),
        el('span', { text: 'Mechanic' }),
        el('span', { title: 'Total value traded this week, in Divine Orbs', text: 'Traded' }),
        el('span', { title: 'Distinct drops worth at least ~18 Exalted', text: 'Drops' }),
        el('span', { title: 'Share of all demand sitting on its single biggest item', text: 'Top item' }),
        el('span', { title: 'Volume-weighted price movement over seven days', text: '7d' })
      ]),

      el('div', { class: 'insight__rows' }, rows.slice(0, 6).map(rowEl)),

      el('p', { class: 'insight__why', text: explain(best) }),

      el('p', { class: 'insight__caveat' }, [
        el('b', { text: 'Demand, not yield. ' }),
        'No public API exposes drop rates, so this shows where value trades and whether you can sell into it — not how fast you farm it.'
      ])
    );
  };
}

/** One row per mechanic, showing the four numbers the ranking is actually built on. */
function rowEl(row, i) {
  const momentum = row.momentum;
  const trend = momentum > 0.5 ? 'up' : momentum < -0.5 ? 'down' : 'flat';

  return el('div', { class: `insight__row${i === 0 ? ' is-best' : ''}` }, [
    el('span', { class: 'insight__rank', text: i + 1 }),

    el('div', { class: 'insight__main' }, [
      el('div', { class: 'insight__name' }, [
        row.name,
        row.general &&
          el('span', { class: 'insight__general', title: 'Drops broadly, not from one mechanic', text: 'gen' })
      ]),
      el('div', {
        class: `insight__profile is-${row.profile}`,
        title: PROFILE_NOTES[row.profile],
        text: row.profile
      })
    ]),

    el('span', { class: 'insight__num', text: compact(row.turnover) }),
    el('span', { class: 'insight__num', text: row.valuable }),
    el('span', {
      class: `insight__num${row.topShare >= 0.75 ? ' is-warn' : ''}`,
      text: `${Math.round(row.topShare * 100)}%`
    }),
    el('span', {
      class: `insight__num is-${trend}`,
      text: trend === 'flat' ? '—' : `${momentum > 0 ? '+' : ''}${Math.round(momentum)}%`
    })
  ]);
}
