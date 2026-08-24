# NBA Savant

Shot charts, advanced metrics, game logs and play-by-play for the NBA — a Baseball Savant–style
analytics site built on Next.js 15, PostgreSQL and Prisma.

Every number comes from basketball-reference.com: real players, real season lines and real teams for
the 26 seasons from 2000-01 through 2025-26.

## Quick start

```bash
git clone <your-fork> nba-savant && cd nba-savant
npm install
cp .env.example .env          # then set DATABASE_URL
npm run db:migrate            # create the schema
npm run db:seed               # load the 2025-26 season (~2 min)
# npm run ingest              # ...or all 26 seasons, 2000-01 onward (~30 min)
npm run dev                   # http://localhost:3000
```

Postgres 14+ is the only external requirement. If you don't have one:

```bash
docker compose up -d db
# DATABASE_URL="postgresql://nba_savant:nba_savant@localhost:5432/nba_savant?schema=public"
```

Or with a local install:

```bash
sudo -u postgres psql -c "CREATE ROLE nba_savant LOGIN PASSWORD 'nba_savant' CREATEDB"
sudo -u postgres createdb -O nba_savant nba_savant
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Runs the stat-formula self-check (`src/lib/stats.test.ts`) |
| `npm run db:migrate` | Apply migrations (dev) |
| `npm run db:push` | Sync schema without a migration |
| `npm run db:seed` | Wipe and load the current season only |
| `npm run db:studio` | Prisma Studio |
| `npm run ingest` | Wipe and load every season, 2000-01 to 2025-26 |

## Pages

| Route | What's there |
|---|---|
| every page | Scoreboard strip under the nav: one day's slate, calendar to jump dates |
| `/` | League shot profile, season leaders, latest games, top teams |
| `/players` | Searchable, sortable player index with percentile shading |
| `/players/[id]` | Profile: career table, shot chart, trends, full game log |
| `/explorer` | Every player-season or team-season, column groups, CSV/JSON export |
| `/shots` | Shot Chart Analyzer — filter by shooter, defender, zone, distance, period, result |
| `/teams` | Ratings, four factors, pace, strength of schedule |
| `/games` | Scoreboard by date |
| `/games/[id]` | Box scores, game shot chart, filterable play-by-play |
| `/compare` | Up to four players side by side, with their shot charts |
| `/api-docs` | Swagger UI over the public API |

## API

Read-only JSON, rate limited to `RATE_LIMIT_PER_MINUTE` (default 120) requests per minute per IP.
Every list endpoint also accepts `?format=csv`.

```
GET /api/seasons
GET /api/players?q=&team=&position=&limit=&offset=
GET /api/players/:id
GET /api/players/:id/gamelogs?season=&opponent=&minPts=
GET /api/stats?season=&team=&position=&minGp=&sort=&dir=
GET /api/shots?player=&defender=&team=&season=&zone=&result=&minDist=&maxDist=&period=
GET /api/shots/zones?player=&team=&season=
GET /api/teams?season=&conference=&sort=
GET /api/games?season=&team=&date=
GET /api/games/:id
GET /api/leaders?season=&minGp=&limit=
GET /api/compare?ids=1,2,3&season=
GET /api/openapi          # OpenAPI 3.0 spec
```

Full spec and a try-it console: <http://localhost:3000/api-docs>.

## The data

`npm run ingest` scrapes basketball-reference.com into the schema:

```bash
npm run ingest                              # 2000-01 .. 2025-26, ~30 min
npm run ingest -- --from 2020 --to 2026     # seasons named by end year
npm run ingest -- --shots 40 --pbp 30       # more of the derived detail
npm run ingest -- --keep                    # add to the DB instead of wiping it
npm run ingest -- --from 2027 --to 2027 --keep   # a season BR has scheduled but not played
```

A season that hasn't been played yet has a published schedule and empty stat tables, so the ingest
takes the games alone, parks the tip-off time in `status` (where a played game says `Final`), and
leaves the season inactive so the stat pages keep defaulting to one that has numbers in it.

Straight from the source, unmodified:

- every player who appeared in a season, with his real season totals
- the published advanced metrics — PER, TS%, USG%, WS, WS/48, OBPM/DBPM/BPM, VORP, AST%, TRB%, STL%,
  BLK%, TOV% — rather than our own approximations of them
- team ratings and four factors: W-L, pace, ORtg/DRtg, eFG%, TOV%, ORB%/DRB%, FT rate, SOS
- every regular-season game with its date and final score, plus next season's schedule once it's out

Derived, because basketball-reference publishes none of it:

- **Shot coordinates.** Each player's real attempts are spread across the floor to match his
  *published* FGA share and FG% in each distance band (0-3, 3-10, 10-16, 16-to-arc, 3P, with the
  real corner-three split), so the chart's totals and percentages match his real season — but no
  individual dot is a shot that happened.
- **Play-by-play**, for the `--pbp N` most recent games. Real teams, real rosters, real final score;
  who scored when is sampled from each player's real share of his team's points.
- **Individual ORtg/DRtg**, from the approximations in `src/lib/stats.ts`.

Per-game logs stay empty: they're one page per player-season on the source, which is ~15,000
requests. `--shots N` covers the N busiest shooters per season and costs no extra HTTP calls, only
rows — but the "vs league" baseline on the zone chart is averaged over whoever has shots, so at the
default 20 it reflects high-usage scorers rather than the whole league. `--shots 60` is closer.

Basketball-reference bans clients that go faster than ~20 requests a minute. `BREF_DELAY_MS`
(default 3500) paces every call, 429s back off for 90 seconds, and failures retry. The whole run is
about 340 requests.

Schedule it however you like (cron, GitHub Actions, a Railway job) and then poke the app to drop its
cached pages:

```bash
curl -X POST "https://your-app/api/cron/refresh?secret=$CRON_SECRET"
```

`vercel.json` already registers that endpoint as a daily cron.

## Deployment

**Docker** — `docker compose up --build`, then seed:

```bash
docker compose exec web npx prisma migrate deploy
docker compose exec web npm run db:seed
```

**Vercel** — import the repo, set `DATABASE_URL` (Neon, Supabase or any managed Postgres) and
`CRON_SECRET`. The build runs `prisma generate` automatically. Seed or ingest from your machine
against the same `DATABASE_URL`.

**Railway / Render** — add a Postgres plugin, set `DATABASE_URL`, build with `npm run build`, start
with `npx prisma migrate deploy && npm start`.

## How the numbers are computed

`src/lib/stats.ts` holds every formula, and `npm test` checks them against known values and sane
ranges. Two categories, marked in the source:

- **Exact** (Basketball-Reference definitions): TS%, eFG%, USG%, AST%, REB%, STL%, BLK%, TOV%,
  possessions, pace, team ORtg/DRtg, PER (uPER normalized so the league average is 15.0).
- **Approximated**, with the shortcut named in a comment on each function: individual ORtg/DRtg,
  Win Shares, and BPM. BPM here is the linear per-100 core without BBRef's team-adjustment step, so
  it ranks players correctly but can differ by ~1.5 from published values. Each is centered or
  normalized league-wide, so BPM averages 0.0 and PER averages 15.0 by construction.

The site itself shows the published PER/WS/BPM/VORP wherever the source has them, so these formulas
are what the numbers are checked against rather than what's displayed — except individual ORtg/DRtg,
which nobody publishes per player.

## Teams that moved

Franchises that changed city inside the window keep their own row, so a 2005 season shows Seattle and
not Oklahoma City: `SEA`, `VAN` and `NJN` sit alongside the current 30 in `prisma/teams.ts`. Renames
that stayed put fold into the modern franchise (`CHH`/`CHA`/`CHO` are all Charlotte; `NOH`/`NOK` are
New Orleans), which is how the league assigns that history too.

## Project layout

```
prisma/
  schema.prisma      seasons, teams, players, stats, shots, games, play-by-play
  teams.ts           every franchise that played 2000-01 onward
scripts/ingest.ts    basketball-reference -> database
public/logos/        team marks, pulled once from cdn.nba.com
src/
  app/               pages and API routes (App Router)
  components/        ScoreboardBar, ShotChart, StatTable, TrendChart, PlayByPlay, filters
  lib/stats.ts       every advanced metric formula
  lib/stats.test.ts  self-check for the above
  middleware.ts      API rate limiting
```

## Notes and limits

- Rate limiting is in-process. Running more than one instance needs a shared store (Redis/Upstash);
  the swap point is marked in `src/middleware.ts`.
- Caching is Next's route cache (`revalidate = 60`) plus `s-maxage` on API responses. No Redis layer
  — add one when a real query profile says you need it.
- There is no authentication: everything served is public read-only data.
- Shot coordinates and play-by-play are derived, not observed — see [The data](#the-data). Everything
  else on the site is the real published number.
