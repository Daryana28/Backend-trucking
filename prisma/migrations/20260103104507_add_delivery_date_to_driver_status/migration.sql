-- AlterTable
ALTER TABLE "DriverStatus" ADD COLUMN     "deliveryDate" TEXT;

-- CreateIndex
CREATE INDEX "DriverStatus_driverId_tripGroup_idx" ON "DriverStatus"("driverId", "tripGroup");

-- CreateIndex
CREATE INDEX "DriverStatus_deliveryDate_idx" ON "DriverStatus"("deliveryDate");
