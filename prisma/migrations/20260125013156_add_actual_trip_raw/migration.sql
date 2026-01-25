-- CreateTable
CREATE TABLE "ActualTripRaw" (
    "id" TEXT NOT NULL,
    "dailyId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "deliveryDate" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'accugps',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActualTripRaw_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ActualTripRaw_dailyId_key" ON "ActualTripRaw"("dailyId");

-- CreateIndex
CREATE INDEX "ActualTripRaw_deliveryDate_idx" ON "ActualTripRaw"("deliveryDate");

-- CreateIndex
CREATE INDEX "ActualTripRaw_plate_idx" ON "ActualTripRaw"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "ActualTripRaw_deliveryDate_plate_key" ON "ActualTripRaw"("deliveryDate", "plate");

-- AddForeignKey
ALTER TABLE "ActualTripRaw" ADD CONSTRAINT "ActualTripRaw_dailyId_fkey" FOREIGN KEY ("dailyId") REFERENCES "ActualTripDaily"("id") ON DELETE CASCADE ON UPDATE CASCADE;
