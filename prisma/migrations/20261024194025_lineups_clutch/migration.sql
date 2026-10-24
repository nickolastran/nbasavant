-- CreateTable
CREATE TABLE "stints" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "players" INTEGER[],
    "period" INTEGER NOT NULL,
    "start" DOUBLE PRECISION NOT NULL,
    "seconds" DOUBLE PRECISION NOT NULL,
    "pts" INTEGER NOT NULL,
    "oppPts" INTEGER NOT NULL,
    "poss" DOUBLE PRECISION NOT NULL,
    "oppPoss" DOUBLE PRECISION NOT NULL,
    "clutch" BOOLEAN NOT NULL,

    CONSTRAINT "stints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clutch_logs" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "gameId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "pts" INTEGER NOT NULL,
    "fgm" INTEGER NOT NULL,
    "fga" INTEGER NOT NULL,
    "fg3m" INTEGER NOT NULL,
    "fg3a" INTEGER NOT NULL,
    "ftm" INTEGER NOT NULL,
    "fta" INTEGER NOT NULL,
    "reb" INTEGER NOT NULL,
    "ast" INTEGER NOT NULL,
    "stl" INTEGER NOT NULL,
    "blk" INTEGER NOT NULL,
    "tov" INTEGER NOT NULL,

    CONSTRAINT "clutch_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stints_seasonId_teamId_idx" ON "stints"("seasonId", "teamId");

-- CreateIndex
CREATE INDEX "stints_gameId_idx" ON "stints"("gameId");

-- CreateIndex
CREATE INDEX "clutch_logs_seasonId_playerId_idx" ON "clutch_logs"("seasonId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "clutch_logs_playerId_gameId_key" ON "clutch_logs"("playerId", "gameId");

-- AddForeignKey
ALTER TABLE "stints" ADD CONSTRAINT "stints_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stints" ADD CONSTRAINT "stints_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stints" ADD CONSTRAINT "stints_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clutch_logs" ADD CONSTRAINT "clutch_logs_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clutch_logs" ADD CONSTRAINT "clutch_logs_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clutch_logs" ADD CONSTRAINT "clutch_logs_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clutch_logs" ADD CONSTRAINT "clutch_logs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
