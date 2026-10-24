# NBA Savant

An NBA tracker with Baseball Savant's analytics: live scores and box scores, standings, stat and team
leaders, team and player pages, transactions, and every season back to the BAA's first in 1946-47.
Next.js 15, PostgreSQL, Prisma.

## Quick start

```bash
npm install
cp .env.example .env          # set DATABASE_URL and DIRECT_URL (the same URL locally)
npx prisma migrate deploy     # create the schema
npm run ingest                # every season since 1946-47 (~90 min, see below)
npm run sync                  # this season: schedule, rosters, transactions, live results
npm run dev                   # http://localhost:3000
```

In a hurry? `npm run ingest -- --from 2026 --to 2026` loads just 2025-26 in about three minutes.

Postgres 14+ is the only external requirement. If you don't have one:

```bash
docker compose up -d db
# DATABASE_URL="postgresql://nba_savant:nba_savant@localhost:5432/nba_savant?schema=public"
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on :3000 |
| `npm run build` / `npm start` | Production build and serve |
| `npm test` | Self-checks: stat formulas, standings, careers, the player matcher, the feed parsers |
| `npm run ingest` | Wipe and load every season from basketball-reference, 1946-47 on |
| `npm run sync` | The daily sync, by hand (same steps as the cron) |
| `npm run playoffs -- --from 1947 --to 2026` | Playoff lines from basketball-reference, players and teams, by season end year (the ingest doesn't load them); also fills regular-season team PF and DREB |
| `npx prisma migrate deploy` | Apply migrations |
| `npm run db:studio` | Prisma Studio |

## Pages

| Route | What's there |
|---|---|
| every page | Scoreboard strip under the nav: live on game nights, a calendar to jump days |
| `/scores` | A day's games, live, with each side's top performer |
| `/games/[id]` | 2026-27 on: before tip-off a preview (both teams' percentiles, head to head, last ten, best lineups); then linescore, box scores, team stats, real shot chart, play-by-play, updating while live |
| `/schedule` | Upcoming games (or results) by day, by team; preseason, NBA Cup and international games labeled |
| `/standings` | Conference / division / league. W-L, GB, home, road, division, conference, PPG, streak, L10, Pythagorean xW-L, net rating, for any season |
| `/leaders` | Sixteen leaderboards (per game, shooting, PER/BPM/WS/VORP) and a Team Leaders view |
| `/players` | Per game / totals / advanced for every player-season |
| `/awards` | Awards race: MVP, DPOY, ROY, Sixth Man, Most Improved and Clutch ladders, any season since 1973-74 |
| `/players/[id]` | Bio and headshot, pace, next career milestones and active streaks (season in progress), Savant percentile rankings, averages/totals/advanced with career row, shot chart, on/off and clutch, most similar seasons in history, game log, transactions |
| `/team-stats` | Per game and advanced (ratings, four factors) |
| `/teams`, `/teams/[abbr]` | Every franchise: record, leaders, league percentiles, roster, five-man lineups, assist network (who set up whom), schedule, transactions, every season |
| `/transactions` | Signings, waivers, trades (grouped), claims, by season, team and type |
| `/explorer`, `/compare`, `/shots` | Stat explorer with export, players side by side, shot chart analyzer |
| `/api-docs` | Swagger UI over the public API |

## Where the data comes from

| What | Source | How often |
|---|---|---|
| Every season 1946-47 → 2025-26: players, season totals, the published advanced metrics (PER, WS, BPM, VORP...), team ratings, standings alignment, every regular-season final score | basketball-reference.com | `npm run ingest`, once |
| This season's totals and published advanced metrics | basketball-reference.com | daily |
| This season's schedule, scores, box scores, game logs, **real** shots and play-by-play | NBA's CDN (`cdn.nba.com`) | live, and saved at each final |
| Rosters, bios, draft round and pick | NBA's player index | daily |
| Transactions since July 2015 | NBA's transaction log | daily |
| Bios for everyone, birth dates | NBA's all-time player index + basketball-reference's | with the ingest |

A few things worth knowing:

- **Players are keyed by NBA person id**, so every source agrees on who's who and URLs match nba.com's.
  Each basketball-reference player is matched once, by name and the seasons he played (namesakes like
  the two Chris Johnsons are told apart by career overlap). About 99% match automatically; the ingest
  prints the ones since 2014-15 that didn't, and `OVERRIDES` in `src/lib/identity.ts` pins them. An
  unmatched player from before that keeps a hashed id and simply has no NBA bio.
- **A stat the league didn't record yet is empty, not zero.** Minutes before 1951-52, rebounds before
  1950-51, steals/blocks before 1973-74, turnovers before 1977-78, threes before 1979-80, games started
  before 1981-82. Tables show "—", sort those last, and leaderboards and percentiles skip them. Career
  rows say when a stat covers only part of a career.
- **Each season keeps its own identity.** Teams that moved have their own rows (the Minneapolis Lakers,
  the Seattle SuperSonics); renames in the same city fold into today's franchise. Each season's name,
  conference and division come from that year's standings, so 1977-78 shows the Washington Bullets and
  1949-50 has its Central Division.
- **Standings are computed from final scores**, so every split works for every season. The NBA Cup final
  doesn't count toward anyone's record and is left out.
- **Shot charts before 2026-27 are derived**: each high-volume shooter's attempts are drawn to match
  his *published* share and FG% by distance, so the chart's totals tie out but no single dot is a real
  shot. Shot distances start in 1996-97, so earlier seasons have no chart. From 2026-27 every shot is
  real, from the NBA's play-by-play, and charts are labeled accordingly.
- **Game logs and box scores start with 2026-27** (older seasons have final scores only). The NBA's CDN
  archive reaches back to 2019-20 and its stats API has game logs to 1946-47 and shot locations to 1996-97;
  backfilling either is a storage question, not a code one (see below).
- **Lineups, on/off and clutch come from the play-by-play** (2026-27 on). Each game is cut into stints, one
  per team per stretch with the same five on the floor; the feed doesn't say who starts the second half, so
  it's whoever acts in a period before being subbed in. Floor time matches the box score to the second, and
  +/- matches on 97% of player-games (the NBA is inconsistent about free throws around a substitution). The
  clutch is the NBA's: last five minutes of the fourth or overtime, within five.
- A traded player's season is his combined line, filed under his last team, the way nba.com shows it.
- ABA seasons (1967-76) aren't included: they're not NBA stats.

## Keeping it current

`/api/cron/sync` runs daily on Vercel (`vercel.json`, 10:00 UTC). It runs six steps, each on its own
so one source being down doesn't stop the rest:

1. **schedule**: new games (Cup knockouts and playoffs appear as they're set), moved tip-offs, finals
2. **finals**: box scores, real shots, lineup stints and clutch lines for the last three days' games (catches
   stat corrections), and any regular-season final still missing its stints.
   Preseason and playoff games keep their box scores too; a preseason final also rebuilds that
   preseason's totals
3. **playoffs**: this season's playoff totals and advanced metrics, players and teams, from
   basketball-reference, once a playoff game is final
4. **rosters**: who's on which team, numbers, bios, rookies before they've played
5. **transactions**: the whole log, replaced
6. **season totals**: this season's totals and advanced metrics from basketball-reference

On top of that, the live scoreboard saves a game the moment it sees it go final, so standings and game
logs don't wait for the morning. Live data itself is never stored: the pages read it through
`/api/live/scoreboard` and the game page, cached 10 seconds, so the NBA sees the same request rate
however many people are watching.

Run the same steps by hand with `npm run sync`, or trigger the cron:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/sync
```

## Deploying to Vercel + Neon

1. **Database.** Create a Neon project. Put the **pooled** connection string in `DATABASE_URL` and the
   **direct** one in `DIRECT_URL`.
2. **Schema.** From your machine: `DATABASE_URL=<direct> DIRECT_URL=<direct> npx prisma migrate deploy`.
3. **History.** From your machine, against the direct URL: `npm run ingest` (~90 minutes). It has to run
   locally: stats.nba.com, which it uses to match players, turns away most cloud IPs, and a serverless
   function can't run for an hour anyway. Then `npm run sync` once.
4. **Vercel.** Import the repo; set `DATABASE_URL`, `DIRECT_URL` and `CRON_SECRET`. The cron in
   `vercel.json` registers itself. On the Hobby plan crons run once a day, which is all this needs.
5. **Check the live path.** After the first deploy, open `https://your-app/api/live/scoreboard`: a JSON
   scoreboard means Vercel can reach the NBA's CDN. Then hit `/api/cron/sync` with your secret and read
   the per-step report. If basketball-reference refuses Vercel, the `seasonTotals` step says so; run
   `npm run sync` from your machine instead (or from a scheduled GitHub Action).

Storage: the full history is about 200 MB and a season of real shots and game logs adds about 50 MB,
inside Neon's free 0.5 GB. Backfilling real shots for 1996-97 onward (~35 MB a season) would need a paid
tier.

## How the numbers are computed

`src/lib/stats.ts` holds every formula, and `npm test` checks them against known values: the published
Pythagorean records for teams from 1946-47, 1959-60 and 2025-26, standings splits counted by hand, career
lines that straddle 1973-74.

- **Exact** (basketball-reference definitions): TS%, eFG%, USG%, AST%, REB%, STL%, BLK%, TOV%,
  possessions, pace, team ORtg/DRtg, PER, Pythagorean wins (exponent 14).
- **Expected shooting** (2026-27 on, from real shots): shot quality is the eFG% the league makes from
  the spots a player shoots from (shot value and distance to the foot), and by shot type (jumper, layup,
  dunk, hook) wherever the league has taken 100 of that type from that spot; shot-making is his eFG% minus that.
- **Similar seasons**: every player-season with 500 minutes (prorated, never under 200) as twelve stats (box
  score per 36, TS%, USG%, 3PA and FT rate, WS/48, BPM), each a z-score within its own season, so eras compare
  by standing, not raw numbers. Nearest by RMS distance over the stats both seasons have, needing three
  quarters of the player's. Computed in memory from the whole history, cached an hour.
- **Approximated**, with the shortcut named in a comment on each function: individual ORtg/DRtg, Win
  Shares and BPM. The site shows the published PER/WS/BPM/VORP; the only approximations on screen are
  individual ORtg/DRtg, which nobody publishes, and they're left empty before 1973-74.

## Notes and limits

- basketball-reference bans clients faster than ~20 requests a minute. `BREF_DELAY_MS` (default 3500)
  paces every call; the ingest waits out 429s, the cron gives up and retries tomorrow.
- The NBA's CDN only answers requests that carry nba.com as the referrer, which the server-side fetch
  sends. That's what every open-source NBA tool does, but the NBA's terms don't grant reuse of the feed:
  fine for a personal or portfolio site, not for a commercial one.
- Rate limiting of the public API is in-process. More than one instance needs a shared store
  (Redis/Upstash); the swap point is marked in `src/middleware.ts`.
- There is no authentication: everything served is public read-only data.
