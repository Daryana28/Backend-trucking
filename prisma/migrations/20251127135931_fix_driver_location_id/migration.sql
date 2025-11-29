/*
  Warnings:

  - The primary key for the `DriverLocation` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[driverId]` on the table `DriverLocation` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "DriverLocation" DROP CONSTRAINT "DriverLocation_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "DriverLocation_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "DriverLocation_id_seq";

-- CreateIndex
CREATE UNIQUE INDEX "DriverLocation_driverId_key" ON "DriverLocation"("driverId");
