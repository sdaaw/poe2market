import { el, clear, fmt } from './util.js';
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
        el('h3', { text: 'Where the money actually is' }),
        el('p', {
          text: 'Mechanics ranked on how much value their drops trade, how many are worth listing, and whether that value is spread or stuck on one item.'
        })
      ]),

      el('div', { class: 'insight__rows' }, rows.slice(0, 6).map(rowEl)),

      el('p', { class: 'insight__why', text: explain(best) }),

      el('p', { class: 'insight__caveat' }, [
        el('b', { text: 'What this is not: ' }),
        'a divine-per-hour estimate. No public API exposes drop rates or clear times, so this measures demand — where value trades and whether you can sell into it — not how fast you generate it. A chase unique with eleven listings sets a ceiling, not an income.'
      ])
    );
  };
}

function rowEl(row, i) {
  return el('div', { class: `insight__row${i === 0 ? ' is-best' : ''}` }, [
    el('span', { class: 'insight__rank', text: i + 1 }),

    el('div', { class: 'insight__main' }, [
      el('div', { class: 'insight__name' }, [
        row.name,
        row.general && el('span', { class: 'insight__general', title: 'Drops broadly, not from one mechanic', text: 'general' })
      ]),
      el('div', { class: 'insight__meta', text: `${fmt(row.turnover)} div · ${row.valuable} drops · ${PROFILE_NOTES[row.profile]}` })
    ]),

    el('div', { class: 'insight__score' }, [
      el('div', { class: 'insight__bar' }, [
        el('div', { class: 'insight__fill', style: `width:${Math.max(4, row.score * 100)}%` })
      ]),
      el('span', { class: `insight__profile is-${row.profile}`, text: row.profile })
    ])
  ]);
}
