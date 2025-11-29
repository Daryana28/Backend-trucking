/*
  Warnings:

  - You are about to drop the `DriverLocation` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "DriverLocation" DROP CONSTRAINT "DriverLocation_driverId_fkey";

-- AlterTable
ALTER TABLE "DriverStatus" ADD COLUMN     "heading" DOUBLE PRECISION,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION;

-- DropTable
DROP TABLE "DriverLocation";
