-- CreateTable
CREATE TABLE "seasons" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "seasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" INTEGER NOT NULL,
    "abbreviation" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conference" TEXT NOT NULL,
    "division" TEXT NOT NULL,
    "primaryColor" TEXT NOT NULL DEFAULT '#1d428a',

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "players" (
    "id" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "position" TEXT,
    "jersey" TEXT,
    "heightIn" INTEGER,
    "weightLb" INTEGER,
    "birthDate" TIMESTAMP(3),
    "country" TEXT,
    "draftYear" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "teamId" INTEGER,

    CONSTRAINT "players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_stats" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "teamId" INTEGER,
    "gp" INTEGER NOT NULL DEFAULT 0,
    "gs" INTEGER NOT NULL DEFAULT 0,
    "min" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pts" INTEGER NOT NULL DEFAULT 0,
    "reb" INTEGER NOT NULL DEFAULT 0,
    "oreb" INTEGER NOT NULL DEFAULT 0,
    "dreb" INTEGER NOT NULL DEFAULT 0,
    "ast" INTEGER NOT NULL DEFAULT 0,
    "stl" INTEGER NOT NULL DEFAULT 0,
    "blk" INTEGER NOT NULL DEFAULT 0,
    "tov" INTEGER NOT NULL DEFAULT 0,
    "pf" INTEGER NOT NULL DEFAULT 0,
    "fgm" INTEGER NOT NULL DEFAULT 0,
    "fga" INTEGER NOT NULL DEFAULT 0,
    "fg3m" INTEGER NOT NULL DEFAULT 0,
    "fg3a" INTEGER NOT NULL DEFAULT 0,
    "ftm" INTEGER NOT NULL DEFAULT 0,
    "fta" INTEGER NOT NULL DEFAULT 0,
    "ppg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rpg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "apg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fgPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fg3Pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ftPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tsPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "efgPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "usgPct" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "player_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "advanced_stats" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "per" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ortg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "drtg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netRtg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ows" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dws" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ws" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ws48" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "obpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dbpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bpm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "vorp" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "astPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rebPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "stlPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "blkPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tovPct" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "advanced_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" SERIAL NOT NULL,
    "gameCode" TEXT NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,
    "period" INTEGER NOT NULL DEFAULT 4,
    "status" TEXT NOT NULL DEFAULT 'Final',

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_game_logs" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "gameId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "started" BOOLEAN NOT NULL DEFAULT false,
    "min" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pts" INTEGER NOT NULL DEFAULT 0,
    "reb" INTEGER NOT NULL DEFAULT 0,
    "oreb" INTEGER NOT NULL DEFAULT 0,
    "dreb" INTEGER NOT NULL DEFAULT 0,
    "ast" INTEGER NOT NULL DEFAULT 0,
    "stl" INTEGER NOT NULL DEFAULT 0,
    "blk" INTEGER NOT NULL DEFAULT 0,
    "tov" INTEGER NOT NULL DEFAULT 0,
    "pf" INTEGER NOT NULL DEFAULT 0,
    "fgm" INTEGER NOT NULL DEFAULT 0,
    "fga" INTEGER NOT NULL DEFAULT 0,
    "fg3m" INTEGER NOT NULL DEFAULT 0,
    "fg3a" INTEGER NOT NULL DEFAULT 0,
    "ftm" INTEGER NOT NULL DEFAULT 0,
    "fta" INTEGER NOT NULL DEFAULT 0,
    "plusMinus" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "player_game_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shot_data" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "gameId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "teamId" INTEGER NOT NULL,
    "defenderId" INTEGER,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "distanceFt" INTEGER NOT NULL,
    "made" BOOLEAN NOT NULL,
    "value" INTEGER NOT NULL,
    "zone" TEXT NOT NULL,
    "zoneArea" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "period" INTEGER NOT NULL,
    "minsLeft" INTEGER NOT NULL,
    "secsLeft" INTEGER NOT NULL,
    "shotClock" DOUBLE PRECISION,
    "defDistFt" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shot_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_stats" (
    "id" SERIAL NOT NULL,
    "teamId" INTEGER NOT NULL,
    "seasonId" INTEGER NOT NULL,
    "gp" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "pace" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ortg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "drtg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netRtg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "efgPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tsPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tovPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orebPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ftRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oppEfgPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oppTovPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "drebPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sos" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "drtgByPosition" JSONB,

    CONSTRAINT "team_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "play_by_play" (
    "id" SERIAL NOT NULL,
    "gameId" INTEGER NOT NULL,
    "eventNum" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "clock" TEXT NOT NULL,
    "elapsedSec" INTEGER NOT NULL,
    "teamId" INTEGER,
    "playerId" INTEGER,
    "description" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,

    CONSTRAINT "play_by_play_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seasons_key_key" ON "seasons"("key");

-- CreateIndex
CREATE INDEX "seasons_startYear_idx" ON "seasons"("startYear");

-- CreateIndex
CREATE UNIQUE INDEX "teams_abbreviation_key" ON "teams"("abbreviation");

-- CreateIndex
CREATE INDEX "teams_conference_division_idx" ON "teams"("conference", "division");

-- CreateIndex
CREATE INDEX "players_fullName_idx" ON "players"("fullName");

-- CreateIndex
CREATE INDEX "players_teamId_active_idx" ON "players"("teamId", "active");

-- CreateIndex
CREATE INDEX "player_stats_seasonId_ppg_idx" ON "player_stats"("seasonId", "ppg" DESC);

-- CreateIndex
CREATE INDEX "player_stats_seasonId_tsPct_idx" ON "player_stats"("seasonId", "tsPct" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "player_stats_playerId_seasonId_teamId_key" ON "player_stats"("playerId", "seasonId", "teamId");

-- CreateIndex
CREATE INDEX "advanced_stats_seasonId_bpm_idx" ON "advanced_stats"("seasonId", "bpm" DESC);

-- CreateIndex
CREATE INDEX "advanced_stats_seasonId_per_idx" ON "advanced_stats"("seasonId", "per" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "advanced_stats_playerId_seasonId_key" ON "advanced_stats"("playerId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "games_gameCode_key" ON "games"("gameCode");

-- CreateIndex
CREATE INDEX "games_date_idx" ON "games"("date" DESC);

-- CreateIndex
CREATE INDEX "games_seasonId_date_idx" ON "games"("seasonId", "date" DESC);

-- CreateIndex
CREATE INDEX "games_homeTeamId_idx" ON "games"("homeTeamId");

-- CreateIndex
CREATE INDEX "games_awayTeamId_idx" ON "games"("awayTeamId");

-- CreateIndex
CREATE INDEX "player_game_logs_playerId_date_idx" ON "player_game_logs"("playerId", "date" DESC);

-- CreateIndex
CREATE INDEX "player_game_logs_gameId_idx" ON "player_game_logs"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "player_game_logs_playerId_gameId_key" ON "player_game_logs"("playerId", "gameId");

-- CreateIndex
CREATE INDEX "shot_data_playerId_seasonId_idx" ON "shot_data"("playerId", "seasonId");

-- CreateIndex
CREATE INDEX "shot_data_gameId_idx" ON "shot_data"("gameId");

-- CreateIndex
CREATE INDEX "shot_data_seasonId_zone_idx" ON "shot_data"("seasonId", "zone");

-- CreateIndex
CREATE INDEX "shot_data_teamId_seasonId_idx" ON "shot_data"("teamId", "seasonId");

-- CreateIndex
CREATE INDEX "team_stats_seasonId_netRtg_idx" ON "team_stats"("seasonId", "netRtg" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "team_stats_teamId_seasonId_key" ON "team_stats"("teamId", "seasonId");

-- CreateIndex
CREATE INDEX "play_by_play_gameId_elapsedSec_idx" ON "play_by_play"("gameId", "elapsedSec");

-- CreateIndex
CREATE UNIQUE INDEX "play_by_play_gameId_eventNum_key" ON "play_by_play"("gameId", "eventNum");

-- AddForeignKey
ALTER TABLE "players" ADD CONSTRAINT "players_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_stats" ADD CONSTRAINT "player_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advanced_stats" ADD CONSTRAINT "advanced_stats_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advanced_stats" ADD CONSTRAINT "advanced_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_logs" ADD CONSTRAINT "player_game_logs_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_logs" ADD CONSTRAINT "player_game_logs_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_logs" ADD CONSTRAINT "player_game_logs_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_game_logs" ADD CONSTRAINT "player_game_logs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_data" ADD CONSTRAINT "shot_data_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_data" ADD CONSTRAINT "shot_data_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_data" ADD CONSTRAINT "shot_data_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_data" ADD CONSTRAINT "shot_data_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shot_data" ADD CONSTRAINT "shot_data_defenderId_fkey" FOREIGN KEY ("defenderId") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_stats" ADD CONSTRAINT "team_stats_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_stats" ADD CONSTRAINT "team_stats_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "play_by_play" ADD CONSTRAINT "play_by_play_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
