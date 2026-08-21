import { el, clear, fmt, timeAgo } from './util.js';
import { state, subscribe, loadLeagues, loadSnapshot } from './store.js';
import { closeDetail } from './detail.js';
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
const updateInsight = mountInsight(document.getElementById('insight'));

const currentView = () => (location.hash.replace('#/', '') || 'overview').split('?')[0];

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

  if (leagueSelect.value !== state.league || leagueSelect.options.length !== state.leagues.length) {
    clear(leagueSelect).append(
      ...state.leagues.map((l) => el('option', { value: l.id, text: l.name, selected: l.id === state.league }))
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

  const view = VIEWS[currentView()] ?? renderOverview;
  clear(app).append(view());
  window.scrollTo({ top: 0 });
}

subscribe(render);

window.addEventListener('hashchange', () => {
  closeDetail();
  render();
});

leagueSelect.addEventListener('change', (e) => {
  closeDetail();
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
