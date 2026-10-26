-- Nothing ever filled these: the NBA's play-by-play names no closest defender.
ALTER TABLE "shot_data" DROP CONSTRAINT "shot_data_defenderId_fkey";
ALTER TABLE "shot_data" DROP COLUMN "defenderId",
DROP COLUMN "defDistFt";
