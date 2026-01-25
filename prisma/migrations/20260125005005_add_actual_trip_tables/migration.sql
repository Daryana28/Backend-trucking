-- CreateTable
CREATE TABLE "ActualTripDaily" (
    "id" TEXT NOT NULL,
    "deliveryDate" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "tripCount" INTEGER NOT NULL DEFAULT 0,
    "nearStops" INTEGER NOT NULL DEFAULT 0,
    "targetLat" DOUBLE PRECISION,
    "targetLng" DOUBLE PRECISION,
    "radiusM" INTEGER,
    "cooldownMin" INTEGER,
    "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActualTripDaily_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActualTripStop" (
    "id" TEXT NOT NULL,
    "dailyId" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "deliveryDate" TEXT NOT NULL,
    "stopNo" INTEGER,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "startSec" INTEGER,
    "endSec" INTEGER,
    "durationSec" INTEGER,
    "address" TEXT,
    "isNear" BOOLEAN NOT NULL DEFAULT false,
    "distM" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActualTripStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActualTripDaily_deliveryDate_idx" ON "ActualTripDaily"("deliveryDate");

-- CreateIndex
CREATE INDEX "ActualTripDaily_plate_idx" ON "ActualTripDaily"("plate");

-- CreateIndex
CREATE UNIQUE INDEX "ActualTripDaily_deliveryDate_plate_key" ON "ActualTripDaily"("deliveryDate", "plate");

-- CreateIndex
CREATE INDEX "ActualTripStop_deliveryDate_idx" ON "ActualTripStop"("deliveryDate");

-- CreateIndex
CREATE INDEX "ActualTripStop_plate_idx" ON "ActualTripStop"("plate");

-- AddForeignKey
ALTER TABLE "ActualTripStop" ADD CONSTRAINT "ActualTripStop_dailyId_fkey" FOREIGN KEY ("dailyId") REFERENCES "ActualTripDaily"("id") ON DELETE CASCADE ON UPDATE CASCADE;
