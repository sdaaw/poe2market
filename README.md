# PoE Market

An economy tracker for **both Path of Exile games**: the most expensive uniques,
currency exchange rates, and a page of statistics you can't get from a plain price
list. Switch games from the header.

## Two realms, one shape

The realms are not as similar as they look, and `server/realms.js` is where the
differences live:

|  | PoE 2 | PoE 1 |
| --- | --- | --- |
| Unit of account | Divine Orbs | **Chaos Orbs** |
| Item response | `primaryValue` + a `core` block | `chaosValue` / `divineValue` per line |
| Item extras | rune-socketed variants | **socket links** (5L / 6L) |
| Categories | mechanic names (Ritual, Breach) | item families (Scarab, Fossil, Oil) |

Everything is normalised to Divine Orbs and one field naming, so no view has to
know which game it is showing. Each realm declares its own `secondaryUnit`, which
rides along with the exchange rates — that is what makes cheap items quote in
Exalted on PoE2 and in Chaos on PoE1 without a single call site branching on realm.

PoE1 tracks uniques only. `BaseType` (20k rare bases) and `SkillGem` (7.5k gem
permutations) are 13 MB between them and are a different kind of thing from what
this site does.

Data comes from the [poe.ninja economy API](https://poe.ninja/docs/api).

**It is a fully static site with no dependencies** — not a single npm package, and
no server in production. A scheduled GitHub Action fetches the economy, writes it
to `public/data/*.json`, and publishes the folder to GitHub Pages.

## Running it locally

```bash
npm run refresh
```

That fetches both economies and writes `public/data/`. Pass a realm to build just
one — `node scripts/snapshot.js poe1` — which leaves the other realm's data files
and its entry in the index untouched. Then:

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

**Uniques** — all ~740 tracked uniques, sortable by price, listing count, level
requirement or trend. Search covers **modifier text**, not just names, so "spirit"
or "movement speed" finds every unique granting it. Rows that matched on a mod show
which one, with the term highlighted, so a result is never unexplained. Stat chips
give one-click searches for the most-shopped stats. Clicking a row opens the full
item card and its price history.

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

Alongside the ranking, each row shows how that mechanic's **traded value** has moved
over the recorded history — demand momentum, which is a different question from the
price momentum in the score: turnover can climb while unit prices sit still. It is
shown but deliberately **not scored**, so the weights above remain the whole story
of how mechanics are ordered.

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

## Linkable items

Every item has a URL. Opening one appends it to the current view
(`#/uniques?item=armour-temporalis-silk-robe`) rather than routing to a page of
its own, so a shared link drops the reader onto the list they'd have been looking
at, and closing the panel leaves them there. The panel has a copy-link button.

- Ids come from the entry's composite key, not its display name, which keeps the
  two Temporalis variants apart — verified collision-free across all 1,378 entries.
- Opening an item deliberately does **not** re-render the page underneath;
  otherwise a click would discard the reader's filters and scroll position.
- Back closes the panel, forward reopens it, Escape and the close button navigate
  rather than just hiding, so the URL never disagrees with the screen.
- A stale or unknown id drops the parameter instead of leaving a dead URL.

## Which roll makes it expensive

Most uniques roll a random subset of their modifiers, and which subset decides
almost everything about the price. **PoE1 prices each combination separately**, so
hovering a row shows the ladder:

```
Foulborn Dialla's Malefaction — what each roll sells for
  ▸ 6,788 div   Gem Level, Blue Requirements
      85.8 div  Gem Level              6L
      1.93 div  Blue Requirements      6L
       169 chaos Blue Requirements
    The best roll is worth 9561x the worst.
```

1,028 priced roll variants across 415 PoE1 uniques. Link count is shown beside
each, because a six-link and an unlinked copy of the same roll are different
markets and would otherwise look like contradictory prices for one thing. The same
roll names now appear in the item rows, which previously repeated a unique several
times with no way to tell the entries apart.

**PoE2 has none of this.** Zero variant lines in any category — poe.ninja
publishes one averaged price per unique no matter what it rolled. So for a PoE2
Mageblood the tooltip names the 16-modifier pool and says plainly that the price is
an average across good and bad rolls, rather than implying a precision the feed
does not have. The pool comes from the feed's own `optional` flag; a pool under
three modifiers is ignored, since Headhunter's two charm-slot lines are randomised
and irrelevant next to the modifier no other unique has.

## What sets a unique apart

Hovering a row in the uniques table shows the modifiers that appear on **no other
unique**, which is usually the reason anyone buys the item. Headhunter's life and
strength rolls are shared with 185 and 78 other uniques; "you gain its Modifiers
for 60 seconds" is shared with none. Modifiers that roll a range are marked, since
there the number is the buying decision — Temporalis is a different item at −2.0
seconds than at −1.09.

Modifiers are normalised (`(205-299)% increased Physical Damage` →
`#% increased Physical Damage`) and counted across distinct uniques, collapsing
variants so a six-link and its unlinked twin don't double-count everything they
share.

**It measures how rare a modifier is, not how good.** The Gnashing Sash's "Lose 5%
of maximum Life per second" is rare and is a drawback. Nothing in price data
separates a defining upside from a defining downside, so the tooltip labels
distinctiveness and leaves the judgement to the reader.

### Why there is no "which modifiers make items expensive" ranking

Because it does not survive contact with the data. Ranking modifiers by the price
of items carrying them puts *"Magic Utility Flasks cannot be Used"* on top at 1302×
the baseline — that is Mageblood's own modifier, six listings of one item. Collapse
variants and require a real sample and the signal vanishes: the best genuine stat
lands at 1.3×, which is noise.

The cause is structural. Modifiers shared by enough uniques to measure are the
generic ones, and those carry no pricing power; **773 of PoE2's 1,464 modifiers
appear on exactly one unique**, which is precisely why those items are worth
something and precisely why they can never clear a statistical bar.

Exclusivity itself only predicts value in one game. Rich PoE2 uniques draw 58% of
their modifiers from lines nothing else has, against 33% for cheap ones — but in
PoE1 that reverses (19% vs 33%), and its most expensive item, Demigod's Beacon at
5,558 div, has *no* exclusive modifiers at all. It is a tournament prize; its price
is scarcity, which appears nowhere in the modifier text.

## Price history

poe.ninja gives seven sparkline points and nothing older, so the site keeps its
own record. Every scheduled build appends the day's prices to
`public/history/<league>.json` and CI commits the file back — **the repository is
the store.** There is no database, and there deliberately isn't a per-visitor one:
history in `localStorage` would mean every new reader arrives to an empty chart.

- One point per item per UTC day. Runs during the day overwrite that day's entry,
  so each value settles as a daily close.
- Series are arrays positionally aligned to a shared `dates` array, which is far
  cheaper than repeating a timestamp per point. Days with no reading stay `null`
  and are drawn as gaps, never bridged with an invented line.
- Growth is roughly 8 KB/day raw (~2 KB gzipped) for ~1,400 series, capped at
  `MAX_DAYS = 180` in `scripts/history.js`.
- The file is fetched lazily — only when something actually draws a chart — so
  opening the site costs nothing extra.
- Per-mechanic turnover and concentration are recorded alongside, so the content
  analysis can grow trend lines as data accumulates.

**It starts empty.** Nothing is back-filled: the 7-day sparkline can't be turned
back into absolute prices without inventing numbers. Charts appear once an item
has three days recorded; before that the panel says how much has been collected.

The commit step marks its commits `[skip ci]`. Without that, pushing history would
retrigger the workflow's own `push` trigger and the job would run itself forever.
A useful side effect of committing every 30 minutes: the repo never goes 60 days
without activity, so scheduled workflows don't get disabled.

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
