-- AlterTable
ALTER TABLE "team_stats" ADD COLUMN     "dreb" INTEGER,
ADD COLUMN     "pf" INTEGER;

-- CreateTable
CREATE TABLE "team_split_stats" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT,
    "gp" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "pace" DOUBLE PRECISION,
    "ortg" DOUBLE PRECISION,
    "drtg" DOUBLE PRECISION,
    "netRtg" DOUBLE PRECISION,
    "efgPct" DOUBLE PRECISION,
    "tsPct" DOUBLE PRECISION,
    "tovPct" DOUBLE PRECISION,
    "orebPct" DOUBLE PRECISION,
    "ftRate" DOUBLE PRECISION,
    "oppEfgPct" DOUBLE PRECISION,
    "oppTovPct" DOUBLE PRECISION,
    "drebPct" DOUBLE PRECISION,
    "sos" DOUBLE PRECISION,
    "pts" INTEGER,
    "oppPts" INTEGER,
    "reb" INTEGER,
    "oreb" INTEGER,
    "dreb" INTEGER,
    "ast" INTEGER,
    "stl" INTEGER,
    "blk" INTEGER,
    "tov" INTEGER,
    "fgm" INTEGER,
    "fga" INTEGER,
    "fg3m" INTEGER,
    "fg3a" INTEGER,
    "ftm" INTEGER,
    "fta" INTEGER,
    "pf" INTEGER,

    CONSTRAINT "team_split_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_split_stats_seasonId_kind_idx" ON "team_split_stats"("seasonId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "team_split_stats_teamId_seasonId_kind_key" ON "team_split_stats"("teamId", "seasonId", "kind");

-- AddForeignKey
ALTER TABLE "team_split_stats" ADD CONSTRAINT "team_split_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_split_stats" ADD CONSTRAINT "team_split_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
