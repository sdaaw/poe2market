# PoE2 Market

A Path of Exile 2 economy tracker: the most expensive uniques, currency exchange
rates, and a page of statistics you can't get from a plain price list.

Data comes from the [poe.ninja PoE2 economy API](https://poe.ninja/docs/api).

**It is a fully static site with no dependencies** — not a single npm package, and
no server in production. A scheduled GitHub Action fetches the economy, writes it
to `public/data/*.json`, and publishes the folder to GitHub Pages.

## Running it locally

```bash
npm run refresh
```

That fetches the economy and writes `public/data/`. Then:

```bash
npm start
```

Open <http://localhost:3000>. The server is a ~60-line static file server for
local preview only; production is just files.

There is nothing to `npm install`. Node 18+ is the only requirement.

## Deploying to GitHub Pages

1. Push the repo to GitHub with `main` as the default branch.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Go to **Actions**, pick **Refresh data and deploy**, and hit **Run workflow**.

The site lands at `https://<user>.github.io/<repo>/` and refreshes itself roughly
every 30 minutes from then on.

Two things worth knowing about the schedule:

- GitHub runs cron on a best-effort queue, so "every 30 minutes" can drift to 45+
  under load. The header shows how old the data actually is.
- **GitHub disables scheduled workflows after 60 days without repo activity.** If
  the site goes stale, push a commit or re-run the workflow manually to wake it up.

### Cloudflare Pages instead

Same idea, no cron caveats, if you'd rather: connect the repo, set the build
command to `node scripts/snapshot.js`, the output directory to `public`, and add a
Cron Trigger or scheduled deploy to rebuild.

## What it shows

**Overview** — Divine/Exalted/Chaos rates, the current Mirror price, the chase
list of the priciest uniques, the sharpest seven-day movers, and which currencies
actually see volume.

**Uniques** — all ~740 tracked uniques, searchable and sortable by price, listing
count, level requirement or trend. Clicking a row opens the full item card with
modifiers, properties and flavour text.

**Currency** — every exchange category poe.ninja tracks: orbs, fragments, runes,
soul cores, essences, uncut and lineage gems, omens, liquid emotions, catalysts,
abyssal bones, expedition currency, idols and verisium.

**Statistics** — the wealth pyramid of the whole unique pool, what one Mirror of
Kalandra actually buys, the priciest unique per equipment slot, supply extremes
(scarcity vs. glut), the most volatile markets, median price by level requirement,
and what rune-socketed variants sell for over their plain counterparts.

## How it fits together

```
scripts/snapshot.js   Build step: fetch 22 categories -> public/data/*.json
server/
  ninja.js            poe.ninja client — fetching and normalising (build-time only)
  index.js            Local static preview server (not used in production)
public/               <- this folder is the entire deployed site
  index.html, styles.css
  data/               Generated. Gitignored; CI builds it fresh each run.
  js/app.js           hash router, theme + league chrome
  js/store.js         snapshot state, subscriptions, shared selectors
  js/table.js         sortable table
  js/detail.js        item side panel
  js/util.js          DOM helper, formatting, sparklines
  js/views/*.js       one module per page
```

No build step for the frontend and no framework — the browser loads ES modules
directly. All asset paths are relative so the site works from a project subpath
(`user.github.io/repo/`) as well as a domain root.

The snapshot is ~1 MB of JSON, about 213 KB gzipped, fetched once per visit.

## The "what should I farm" chip

The header carries a small chip naming the mechanic with the strongest market,
with the full ranking behind it. It deliberately does **not** reason from headline
item prices — "Temporalis is worth 3,800 div, so farm wherever it drops" describes
a lottery ceiling, not an income.

Instead each mechanic is scored on four things, ranked against the other mechanics
rather than absolute thresholds (what counts as "deep" depends on the league and
how old it is):

| Component | Weight | Question it answers |
| --- | --- | --- |
| Depth | 35% | Can the market absorb what you farm, or does it collapse when you list a stack? |
| Breadth | 25% | How many distinct drops clear a worthwhile price? |
| Consistency | 25% | Is the value spread, or does one item carry the whole category? |
| Momentum | 15% | Volume-weighted 7-day movement, clamped so a spike can't buy the top spot. |

Consistency is what stops the obvious mistake. Idols currently post some of the
strongest momentum of any mechanic and still rank near the bottom, because 96% of
their turnover sits on a single item — a lottery wearing a mechanic's clothes.

**Its limits, stated plainly:** it measures demand, not yield. No public economy
API exposes drop rates or clear times, so it cannot produce a divine-per-hour
figure and does not try. Read it as "where the money is and whether you can
realise it", then weigh that against your own clear speed. The grouping comes from
poe.ninja's own category keys, so "Ritual" means the Omens it files under Ritual.
A few categories (Runes, Uncut Gems, Fragments) drop broadly rather than from one
mechanic and are tagged `general`.

The logic lives in `public/js/analysis.js`, kept DOM-free so it can be run and
checked straight from Node.

## Notes on the data

- **Prices are in Divine Orbs.** That is poe.ninja's primary unit; the UI converts
  to Exalted for anything under a Divine, since that's how players quote cheap items.
- **Percentage changes need liquidity.** A unique with two listings can post a
  four-digit "gain", so movers and volatility lists require at least 10 listings
  (or 50 div of turnover for currency) and a non-trivial price. See `meaningful()`
  in `public/js/store.js`.
- **Rune premiums need a real base price.** Hundreds of uniques sit at the
  1-Exalted floor; comparing a 300 div rune-socketed version against that floor
  produces a meaningless five-digit percentage, so both halves of a pair must clear
  a price floor. See `findRunePairs()` in `public/js/views/stats.js`.
- **Listing counts cap at 10,000** upstream, shown as `10k+`.
- **Only leagues poe.ninja actively indexes are built.** Right now that is just the
  current challenge league; Standard and Hardcore return empty and are skipped.
- The build fetches upstream **once per scheduled run, not once per visitor** —
  which is the main reason this is a static site. Please keep it that way.

Not affiliated with Grinding Gear Games or poe.ninja.
