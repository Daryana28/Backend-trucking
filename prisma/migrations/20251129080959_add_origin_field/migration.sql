/*
  Warnings:

  - You are about to drop the column `heading` on the `DriverStatus` table. All the data in the column will be lost.
  - You are about to drop the column `lat` on the `DriverStatus` table. All the data in the column will be lost.
  - You are about to drop the column `lng` on the `DriverStatus` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DriverStatus" DROP COLUMN "heading",
DROP COLUMN "lat",
DROP COLUMN "lng",
ADD COLUMN     "origin" TEXT;
