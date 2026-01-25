-- CreateTable
CREATE TABLE "ActualTripEvent" (
    "id" TEXT NOT NULL,
    "dailyId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "deliveryDate" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stopNo" INTEGER,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "startSec" INTEGER,
    "endSec" INTEGER,
    "durationSec" INTEGER,
    "distanceMeters" INTEGER,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActualTripEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActualTripEvent_deliveryDate_idx" ON "ActualTripEvent"("deliveryDate");

-- CreateIndex
CREATE INDEX "ActualTripEvent_plate_idx" ON "ActualTripEvent"("plate");

-- AddForeignKey
ALTER TABLE "ActualTripEvent" ADD CONSTRAINT "ActualTripEvent_dailyId_fkey" FOREIGN KEY ("dailyId") REFERENCES "ActualTripDaily"("id") ON DELETE CASCADE ON UPDATE CASCADE;
