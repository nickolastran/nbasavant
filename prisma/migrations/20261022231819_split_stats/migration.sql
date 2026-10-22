-- CreateTable
CREATE TABLE "split_stats" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "teamId" INTEGER,
    "gp" INTEGER NOT NULL,
    "gs" INTEGER,
    "min" DOUBLE PRECISION,
    "pts" INTEGER NOT NULL,
    "reb" INTEGER,
    "oreb" INTEGER,
    "dreb" INTEGER,
    "ast" INTEGER,
    "stl" INTEGER,
    "blk" INTEGER,
    "tov" INTEGER,
    "pf" INTEGER,
    "fgm" INTEGER NOT NULL,
    "fga" INTEGER NOT NULL,
    "fg3m" INTEGER,
    "fg3a" INTEGER,
    "ftm" INTEGER NOT NULL,
    "fta" INTEGER NOT NULL,
    "ppg" DOUBLE PRECISION NOT NULL,
    "rpg" DOUBLE PRECISION,
    "apg" DOUBLE PRECISION,
    "fgPct" DOUBLE PRECISION,
    "fg3Pct" DOUBLE PRECISION,
    "ftPct" DOUBLE PRECISION,
    "tsPct" DOUBLE PRECISION,
    "efgPct" DOUBLE PRECISION,
    "usgPct" DOUBLE PRECISION,
    "per" DOUBLE PRECISION,
    "ows" DOUBLE PRECISION,
    "dws" DOUBLE PRECISION,
    "ws" DOUBLE PRECISION,
    "ws48" DOUBLE PRECISION,
    "obpm" DOUBLE PRECISION,
    "dbpm" DOUBLE PRECISION,
    "bpm" DOUBLE PRECISION,
    "vorp" DOUBLE PRECISION,
    "astPct" DOUBLE PRECISION,
    "rebPct" DOUBLE PRECISION,

    CONSTRAINT "split_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "split_stats_seasonId_kind_idx" ON "split_stats"("seasonId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "split_stats_playerId_seasonId_kind_key" ON "split_stats"("playerId", "seasonId", "kind");

-- AddForeignKey
ALTER TABLE "split_stats" ADD CONSTRAINT "split_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_stats" ADD CONSTRAINT "split_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_stats" ADD CONSTRAINT "split_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
