# Review Intelligence Platform

A hotel database for whole towns and cities, built by scraping **Google Maps, Booking.com, Agoda and
MakeMyTrip** (Tripadvisor optional), stored in **Postgres + PostGIS**.

- **Seeding:** enter city or town names (e.g. `Mussoorie`). Each one is found on Google Maps and
  searched tile by tile for hotels, guest houses, resorts and homestays. Nearby hotels are linked
  together and grouped into micro-markets. Then every hotel is collected from all platforms: profile,
  ratings, category scores, prices and reviews.
- **Owners get data instantly:** typing a hotel's name finds it in the database. If the hotel is new,
  it is collected first, then its neighbourhood: hotels within 3 km are found (if that area was never
  mapped) and every one of them is collected.
- **Always fresh:** every hotel is re-collected about every **15 days**. Each hotel gets a random offset
  of ±3 days (the "salt"), so a town seeded in one night does not come due on a single day. Any city
  can be **re-seeded** whenever you want, and so can any owner's neighbourhood.
- **Competitors** are listed straight from the database: distance, price ratio and the default
- **Competitive benchmark (the analysis):** every review is classified by sentiment for 8 aspects: Food,
  Room, Housekeeping, Staff, Location, Value for Money, Cleanliness and Booking Experience. Specific issues
  are tagged too (hot water, breakfast, parking …). This works on English, Hindi and Hinglish text, using
  Gemini when a key is set and offline rules otherwise. The owner then sees:
  - their rating against the market's;
  - each aspect against the competitor set, with **lead / lag / market-wide weakness**;
  - property-specific problems vs conditions the whole market shares, each with quotes;
  - trends with changepoints matched to logged events ("chef left");
  - emerging issues and seasonal patterns;
  - before/after results for fixes they logged.
- **Destination view** for a Tourism Board: what visitors say about a whole town or micro-market. Issues
  no single hotel controls (roads, parking, power, taxis) come first, with evidence and a CSV export.
  like-for-like rules. Scoring and analysis are the next step.

## Requirements

- **Node.js 22.9 or newer** (`node -v`)
- **Postgres 16 with PostGIS.** The easiest way is Docker Desktop and `npm run db:up`. Without Docker,
  install PostgreSQL 16 and add PostGIS with *Application Stack Builder*, then create the databases
  `rip` and `rip_test` and set `DATABASE_URL` / `TEST_DATABASE_URL`.
- Windows, macOS or Linux. The scrapers drive a real Chromium window on your machine.

## Quick start (Windows PowerShell, macOS or Linux)

```bash
cd review-intelligence-platform
npm install
npm run browsers:install          # downloads Chromium for Playwright (once)
copy .env.example server\.env     # macOS/Linux: cp .env.example server/.env
npm run db:up                     # Postgres + PostGIS on :5432 (Docker); creates rip and rip_test
npm run dev                       # API + background worker on :4000, UI on :5173
```

Tables are created automatically on start (`server/migrations/*.sql`).

1. **Seed a town:** open http://localhost:5173/seeding, enter `Mussoorie` and click *Start seeding*.
   The *Places* table shows the progress: map tiles searched, hotels found, hotels collected, reviews and
   clusters. Click the town to see its micro-markets and each hotel's data status.
2. **Owner view:** on *My property*, type a hotel name. Hotels already in the database appear
   instantly under **Already in our database**; *Search Google Maps* is for hotels that are not there yet.
   Confirm *This is my property* and you land on the **competitive benchmark**. Its progress bar shows four
   steps: your data, then competitors found, then competitors collected, then reviews analysed. The
   benchmark fills in as each step finishes.
3. **Destination view:** *Destinations & seeding*, then a town, then *Destination view →*.

**AI analysis (optional but recommended):** put your Gemini key in `server/.env` as `GEMINI_API_KEY=…`,
restart, and run `npm run ai:check`. Without a key everything still works with offline keyword rules,
and the page says which method was used. To redo reviews the rules already analysed with AI, use the
*Re-analyse with AI* button on the benchmark.

A Chromium window opens while background jobs run. Leave it alone. Jobs only run while the app is
running. If you stop it, unfinished jobs go back to the queue and continue on the next start.

### Check things live without the UI

```bash
npm run smoke:seed -- "Mussoorie"                 # find the town + 2 map tiles, build graph and clusters
npm run smoke:seed -- "Mussoorie" --tiles 0       # the whole town (no hotel collection)
npm run smoke -- "JW Marriott Walnut Grove" "Mussoorie" --max 20   # collect one hotel now
```

These are the real proof that the integrations work. The unit tests only prove the logic.

## How it works

```
React (Vite) ──/api──► Express API ──► Postgres + PostGIS  ◄── Worker(s): claim jobs (FOR UPDATE SKIP LOCKED)
                       (reads only;      cities, hotels,          │  seed_city:     resolve town → map tiles → hotels
                        queues jobs)     hotel_neighbors,         │                 → neighbours + clusters → queue hotels
                                         clusters, listings,      │  discover_area: map search around one hotel
                                         snapshots, reviews,      │  profile:       Google → (Agoda→Booking ‖ MakeMyTrip)
                                         jobs                     │  scheduler:     15-day refresh ± jitter, stuck-job recovery
```

**Job priorities** (higher first): owner's own hotel 100 · map search around an owner 90 · selected
competitors 80 · other neighbours 60 · city map search 50 · city hotels 40 · scheduled refresh 20.
A hotel never has two collections queued at once.

**Tables:** `cities`, `hotels` (one row per Google place), `hotel_neighbors` (every pair within 5 km,
both directions, with distance), `clusters` + `cluster_members` (DBSCAN, ~600 m), `discovery_areas`
(what has been mapped, used to skip repeat searches), `platform_listings`, `listing_snapshots`
(rating/count/price history), `reviews`, `compsets`, `jobs`.

**Accounts and payments:** sign-in, plans and Razorpay checkout - see [docs/accounts-and-payments.md](docs/accounts-and-payments.md).

**On AWS:** see [docs/aws-deployment.md](docs/aws-deployment.md). One CloudFormation stack
(`infra/pipeline.yaml`) creates a CodePipeline; every push then tests, builds and deploys to EC2 +
RDS PostgreSQL/PostGIS behind CloudFront (HTTPS).

| Platform | Profile | Reviews | Notes |
|---|---|---|---|
| Google Maps | place page: rating, count, address, phone, website, star class, coords, histogram, **Prices tab** | Reviews tab | Signed-out visitors only see a handful of reviews. The tool does not sign in. |
| Agoda | review API (`HotelReviews`) | review API (`ReviewComments`), most recent first | Called from inside an agoda.com page with the site's own cookies |
| Booking.com | hotel page JSON-LD, sub-scores, facilities, coordinates | **via Agoda's review API (provider 3038)**; otherwise the featured reviews | Booking's old `reviewlist` endpoint now returns 404 |
| MakeMyTrip | hotel-details page: rating, distribution, category scores, MMT's AI summary | review list with pagination | No review ids or posting dates, so de-duplication uses a content fingerprint |
| Tripadvisor | JSON-LD (rating, count, geo, amenities, price band) | review cards, next-page links | Uses strong bot protection, so expect `BLOCKED` sometimes |

**Every platform ends with an explicit outcome:** `SUCCESS`, `SUCCESS_NO_REVIEWS`,
`NEEDS_CONFIRMATION`, `NOT_FOUND`, `BLOCKED`, `LAYOUT_CHANGED`, `TIMEOUT`, `NETWORK_ERROR`,
`FAILED`, `DISABLED`. A failure is never shown as "no reviews". When a page doesn't look as
expected, its HTML is saved to `server/data/raw/<platform>/` for debugging.

**Wrong match?** Each platform card lists the other candidates found and has a box to paste the
correct URL. That re-runs just that platform.

**Duplicates:** `reviewId` is a hash of the platform's own review id, or of a content fingerprint
when the platform has none. Re-running overwrites rather than duplicates, and edited reviews get
`revision + 1`.

## Competitors: how they are found and chosen

1. **Discovery (Google Maps)** — only when the area is not in the database yet: several searches around your pin ("hotels" at your location and 4 points
   around it, plus "guest house", "resort", "homestay" at your location), because signed-out Google shows
   only ~8–10 results per search. Results are de-duplicated by Google place id.
2. **Tagging, no scoring:** distance from you, star class or lodging type, Google rating and review count,
   the price Google shows in the same result list (same dates and guests for everyone), and the price
   ratio against yours (`Much cheaper` < 0.5×, `Cheaper`, `Similar` 0.8–1.25×, `Pricier`, `Much pricier` > 2×).
3. **Default selection** (editable): within the radius (default 3 km), price 0.5–2× yours or unknown,
   at least 20 Google reviews, nearest 10. A ₹1,500 hotel and a ₹15,000 hotel are never paired by
   default, but you can add any place by hand or widen the filters.
4. **Collection:** competitors come from the database; hotels with fresh data (inside their 15-day
   window) are used as they are, the rest are queued. Every hotel is stored once, keyed by its Google
   place id, so a hotel that is both a competitor and someone's own property is scraped once.

**Matching the same hotel on each OTA:** Google's *Prices* tab links straight to the hotel on
MakeMyTrip (`topHtlId`), Agoda (`hid`), Booking.com and Tripadvisor. Those links are used first, so
no name matching is needed. Name + distance search is only a fallback (MakeMyTrip has no fallback; paste
its URL if Google lists no MakeMyTrip price).

| Endpoint | Purpose |
|---|---|
| `GET /api/businesses/:id/competitors` | candidates, selection, collected competitors with per-platform status |
| `POST /api/businesses/:id/competitors/discover` `{radiusKm, force}` | `{covered: true}` if the area is already mapped; otherwise (or with `force`) queue a map search |
| `PUT /api/businesses/:id/competitors/selection` `{placeIds}` | save the chosen set |
| `POST /api/businesses/:id/competitors/collect` `{maxReviews, force}` | queue collection for chosen competitors without fresh data |

| Seeding endpoint | Purpose |
|---|---|
| `POST /api/cities` `{names[], kind, radiusKm?, maxReviews?, enrich?}` | add towns/cities and queue a seeding run each |
| `GET /api/cities`, `GET /api/cities/:id?cluster=` | progress, stats, micro-markets, hotels |
| `POST /api/cities/:id/reseed` `{mode: refresh\|full\|resume}` | map again + collect due hotels / re-collect all / continue a paused run |
| `POST /api/cities/:id/pause` | cancel queued work; a running map search stops after its tile |
| `GET /api/hotels/lookup?name=&location=` | instant fuzzy search in the database |
| `POST /api/businesses` `{hotelId}` or `{name, googleUrl}` | claim a hotel; onboards its neighbourhood |
| `POST /api/businesses/:id/reseed` | search around the hotel again and re-collect every neighbour |
| `GET /api/businesses/:id/history` | rating / review-count / price snapshots over time |
| `GET /api/queue` | running and next jobs |

| Analysis endpoint (`?peers=compset\|cluster\|radius&radiusKm=3`) | Purpose |
|---|---|
| `GET /api/businesses/:id/pipeline` | progress: own data → competitors → collected → analysed |
| `GET /api/businesses/:id/benchmark` | rating vs market, 8 aspects (lead/lag/market-wide), issues per 100 reviews, platform category scores, heatmap, findings with quotes |
| `GET /api/businesses/:id/trends?measure=rating\|food\|…` | monthly you vs market, changepoint + related events, emerging issues (time to detect), seasonal patterns, intervention before/after |
| `GET\|POST /api/businesses/:id/summary` | written summary (Gemini, or template without a key); POST regenerates |
| `POST /api/businesses/:id/analyse` `{upgrade}` | analyse new reviews now (`upgrade`: redo rule-analysed reviews with AI) |
| `GET\|POST\|DELETE /api/businesses/:id/events` | operator events / interventions shown on the trend |
| `GET /api/cities/:id/destination?cluster=` | destination view; `/destination/summary`, `/destination/evidence.csv` |

## Guardrails (by design)

- Only logged-out, public pages. No login, CAPTCHA solving, stealth plugins or user-agent spoofing.
- If a site shows a bot challenge, that platform stops with `BLOCKED` (city map searches retry later, resuming at the same tile).
- Random 1.5–4 s pauses between actions, one job at a time per worker (OTA sites in parallel within a job).
- Reviewer names are **not stored**. Only a salted hash is kept, for de-duplication.
- Each source can be switched off: `ENABLE_<PLATFORM>=false` in `server/.env`.
- Scraping these sites may conflict with their terms of use. Get legal advice before using the
  data commercially.

## Tests

```bash
npm run db:up      # once: the tests use the rip_test database
npm test
```

- `tests/unit`: parsers fed with markup captured from the live sites, normalisation, matching,
  comparability rules, map tiles.
- `tests/db`: the real Postgres/PostGIS SQL: upserts, neighbour graph, DBSCAN clusters, coverage,
  15-day jitter, queue priority/dedupe/retry/recovery, scheduler, onboarding, REST API. The browser is
  replaced by stubs where a job would scrape. Skipped, with a hint, if the test database is not running.
- `tests/browser`: in-page extractors in Chromium against captured markup.

## Project layout

```
client/src/features
  search       DB lookup as you type → Google search for new hotels → claim
  business     property page: freshness, micro-market, platforms, reviews
  competitors  candidates from the database, selection, collection status
  seeding      add cities/towns, progress, pause/resume/re-seed, queue; city page with clusters
server/
  migrations/                 SQL schema (applied automatically)
  src/apps/api                Express app + entry point (runs the worker when WORKER_MODE=embedded)
  src/apps/worker             queue worker + standalone entry (`npm run worker`)
  src/data                    all SQL: hotels, listings/reviews, geo (graph, clusters, coverage), cities, jobs, compsets
  src/services/review-ingestion   adapters, browser, matching, normalizers, profile job
  src/services/competitor-discovery  candidates from the graph, selection, collection
  src/services/seeding        city seeding job, area discovery job, owner onboarding, refresh scheduler
  src/shared                  config, db pool + migrations, logging, errors, validation, utils
  scripts/                    migrate.js, smoke.js, smoke-seed.js
  tests/                      unit, db, browser tests
docs/                         scraping notes, AWS deployment
infra/                        AWS: template.yaml (app stack), pipeline.yaml (CI/CD), buildspecs,
                              ec2/deploy.sh (runs on the server), ec2/app.env (production settings)
Dockerfile, docker-compose.yml, docker/entrypoint.sh
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Chromium is not installed for Playwright` | `npm run browsers:install` |
| A platform shows **Blocked** | Wait a while and use *Refresh all platforms*. Keep `HEADLESS=false`. |
| A platform shows **Page changed** | The site changed its markup. Open the saved HTML in `server/data/raw/<platform>/` and update the selectors in that adapter. |
| MakeMyTrip **Not found** | MMT is matched through Google's price links. If Google shows no MakeMyTrip price for that hotel, paste the MMT hotel-details URL into the card. |
| Only a few nearby places found | Choose a larger radius or search again later. Google limits signed-out results per search. |
| `Cannot reach or migrate Postgres` on start | Start the database: `npm run db:up` (Docker Desktop must be running). Check `DATABASE_URL` in `server/.env`. |
| `extension "postgis" is not available` | Your Postgres has no PostGIS. Use `npm run db:up`, or install PostGIS with Stack Builder. |
| Seeding stopped with **Blocked** | Google showed a challenge. The run retries later and resumes at the same tile; or click *Resume* later. |
| Old hotels from Step 1/2 are missing | The earlier JSON file store (`server/data/db`) is not imported. Search the hotels again; the files can be deleted. |
| Google shows only ~5–10 reviews | That is all Google shows to signed-out visitors. Agoda, Booking.com and MMT give more. |
