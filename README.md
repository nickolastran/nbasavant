# NBA Savant

Shot charts, advanced metrics, game logs and play-by-play for the NBA — a Baseball Savant–style
analytics site built on Next.js 15, PostgreSQL and Prisma.

The repo ships with a generated sample league so the whole site works the moment you seed it, and an
ingest script that replaces that sample with real stats.nba.com data.

## Quick start

```bash
git clone <your-fork> nba-savant && cd nba-savant
npm install
cp .env.example .env          # then set DATABASE_URL
npm run db:migrate            # create the schema
npm run db:seed               # load the sample league (~10s)
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
| `npm run db:seed` | Wipe and regenerate the sample league |
| `npm run db:studio` | Prisma Studio |
| `npm run ingest` | Pull real data from stats.nba.com |

## Pages

| Route | What's there |
|---|---|
| `/` | League shot profile, season leaders, latest games, top teams |
| `/players` | Searchable, sortable player index with percentile shading |
| `/players/[id]` | Profile: career table, shot chart, trends, full game log |
| `/explorer` | Every player-season or team-season, column groups, CSV/JSON export |
| `/shots` | Shot Chart Analyzer — filter by shooter, defender, zone, distance, period, result |
| `/teams` | Ratings, four factors, pace, strength of schedule, defense by opposing position |
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

## Real data

`npm run ingest` pulls from stats.nba.com into the same schema:

```bash
npm run ingest -- --season 2024-25 --shots 60 --pbp 10
```

- `--shots N` — shot charts for the N highest-minute players (one HTTP call each)
- `--pbp N` — play-by-play for the N most recent games

stats.nba.com is undocumented and rate limits hard. `NBA_STATS_DELAY_MS` (default 800ms) paces the
calls; every request retries with backoff. A full season with 60 shot charts takes roughly 5–10
minutes. The endpoint sometimes blocks datacenter IPs — if every call fails, run it from a
residential connection.

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
docker compose exec web npx tsx prisma/seed.ts
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

## Sample data

`prisma/seed.ts` generates a self-consistent league: real team metadata (ids match stats.nba.com so
ingest upserts cleanly onto it) and **fictional players**. Nothing in the seed is a real player's
real stat line.

It is consistent from the bottom up — shots are generated first, box scores are derived from those
shots, season totals from the box scores, and advanced metrics from the season totals — so every
number on the site adds up to the one above it. Size knobs:

```bash
SEED_GAMES_PER_TEAM=40 SEED_PBP_GAMES=100 npm run db:seed
```

Defaults produce 30 teams, 360 players, 600 games, ~104k shots and 30k play-by-play events across
two seasons in about ten seconds.

## Project layout

```
prisma/
  schema.prisma      seasons, teams, players, stats, shots, games, play-by-play
  seed.ts            sample league generator
  teams.ts           real NBA team metadata
scripts/ingest.ts    stats.nba.com -> database
src/
  app/               pages and API routes (App Router)
  components/        ShotChart, StatTable, TrendChart, PlayByPlay, filters
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
