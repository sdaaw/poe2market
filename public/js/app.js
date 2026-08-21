import { el, clear, fmt, timeAgo } from './util.js';
import { state, subscribe, loadLeagues, loadSnapshot, findBySlug, leaguesFor } from './store.js';
import { hideDetail, showDetail } from './detail.js';
import { parseHash, viewHash, forgetPushedItem } from './router.js';
import { renderOverview } from './views/overview.js';
import { renderUniques } from './views/uniques.js';
import { renderCurrency } from './views/currency.js';
import { renderStats } from './views/stats.js';
import { mountInsight } from './insight.js';

const VIEWS = {
  overview: renderOverview,
  uniques: renderUniques,
  currency: renderCurrency,
  stats: renderStats
};

const app = document.getElementById('app');
const tabs = document.getElementById('tabs');
const ratesEl = document.getElementById('rates');
const stamp = document.getElementById('stamp');
const leagueSelect = document.getElementById('league');
const refreshBtn = document.getElementById('refresh');
const themeBtn = document.getElementById('theme');
const realmEl = document.getElementById('realm');
const updateInsight = mountInsight(document.getElementById('insight'));

const currentView = () => parseHash().view;

// What the main area currently holds, so opening an item can leave it untouched.
let renderedView = null;
let renderedSnapshot = null;

/* ---------- theme ---------- */

const savedTheme = localStorage.getItem('poe2.theme');
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

themeBtn.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('poe2.theme', next);
});

/* ---------- chrome ---------- */

function paintChrome() {
  const view = currentView();
  for (const a of tabs.children) a.classList.toggle('is-active', a.dataset.view === view);

  // Realm switch, hidden entirely when only one game has data.
  realmEl.hidden = state.realms.length < 2;
  if (!realmEl.hidden && realmEl.dataset.realm !== state.realm) {
    realmEl.dataset.realm = state.realm;
    clear(realmEl).append(
      ...state.realms.map((r) =>
        el('button', {
          type: 'button',
          class: r.id === state.realm ? 'is-on' : '',
          text: r.label,
          title: r.game,
          'aria-pressed': String(r.id === state.realm),
          onclick: () => {
            if (r.id === state.realm) return;
            hideDetail();
            loadSnapshot(null, r.id);
          }
        })
      )
    );
  }

  const leagues = leaguesFor(state.realm);
  if (leagueSelect.value !== state.league || leagueSelect.options.length !== leagues.length) {
    clear(leagueSelect).append(
      ...leagues.map((l) => el('option', { value: l.id, text: l.name, selected: l.id === state.league }))
    );
  }

  const r = state.snapshot?.rates;
  clear(ratesEl);
  if (r) {
    ratesEl.append(
      el('span', {}, ['1 div = ', el('b', { text: `${fmt(r.exalted)} ex` })]),
      el('span', {}, ['1 div = ', el('b', { text: `${fmt(r.chaos)} chaos` })])
    );
  }

  refreshBtn.classList.toggle('is-busy', state.loading);

  if (state.snapshot) updateInsight();

  const built = state.snapshot?.updatedAt;
  stamp.textContent = built ? `data ${timeAgo(built)}` : '';
  stamp.title = built ? new Date(built).toLocaleString() : '';
}

/* ---------- rendering ---------- */

function render() {
  paintChrome();

  if (state.loading && !state.snapshot) {
    clear(app).append(
      el('div', { class: 'loading' }, [
        el('div', { class: 'spinner' }),
        el('p', { text: 'Loading the Wraeclast economy…' })
      ])
    );
    return;
  }

  if (state.error) {
    clear(app).append(
      el('div', { class: 'error' }, [
        el('h3', { text: 'Could not load the market' }),
        el('p', { text: state.error }),
        el('p', { text: 'The poe.ninja API may be rate-limiting or briefly down. Try refreshing in a moment.' })
      ])
    );
    return;
  }

  if (!state.snapshot) return;

  // poe.ninja only indexes the active challenge leagues; Standard and Hardcore
  // come back empty rather than erroring.
  if (!state.snapshot.items.length && !state.snapshot.currency.length) {
    clear(app).append(
      el('div', { class: 'error' }, [
        el('h3', { text: `No economy data for ${state.snapshot.league}` }),
        el('p', { text: 'poe.ninja only indexes the current challenge leagues. Pick one of those from the league menu above.' })
      ])
    );
    return;
  }

  const { view, item } = parseHash();

  // Only rebuild the page when the view or the data actually changed. Opening an
  // item is a URL change too, and re-rendering there would throw away the
  // reader's filters and scroll position.
  if (view !== renderedView || state.snapshot !== renderedSnapshot) {
    const render = VIEWS[view] ?? renderOverview;
    clear(app).append(render());
    renderedView = view;
    renderedSnapshot = state.snapshot;
    window.scrollTo({ top: 0 });
  }

  syncDetail(item);
}

let shownSlug = null;
let shownSnapshot = null;

/** Drives the detail panel purely from the URL, including on a cold deep link. */
function syncDetail(slug) {
  if (!slug) {
    shownSlug = null;
    forgetPushedItem();
    hideDetail();
    return;
  }

  // Every store update re-renders; rebuilding an unchanged panel would restart
  // its history fetch and throw away the reader's place in it.
  if (slug === shownSlug && state.snapshot === shownSnapshot) return;

  const entry = findBySlug(slug);
  if (entry) {
    shownSlug = slug;
    shownSnapshot = state.snapshot;
    showDetail(entry);
    return;
  }

  // Unknown item: a stale link, or a league that doesn't carry it. Drop the
  // parameter rather than leaving a dead URL in the bar.
  shownSlug = null;
  hideDetail();
  history.replaceState(null, '', viewHash(parseHash().view));
}

subscribe(render);

window.addEventListener('hashchange', render);

leagueSelect.addEventListener('change', (e) => {
  hideDetail();
  loadSnapshot(e.target.value);
});

refreshBtn.addEventListener('click', () => {
  if (!state.loading) loadSnapshot(state.league);
});

/* ---------- boot ---------- */

(async function boot() {
  if (!location.hash) location.hash = '#/overview';
  await loadLeagues();
  await loadSnapshot();
})();
