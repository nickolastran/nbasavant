-- CreateTable
CREATE TABLE "sync_runs" (
    "id" SERIAL NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "report" JSONB NOT NULL,

    CONSTRAINT "sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_runs_at_idx" ON "sync_runs"("at" DESC);
