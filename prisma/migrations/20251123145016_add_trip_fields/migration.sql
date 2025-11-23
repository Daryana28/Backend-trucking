/*
  Warnings:

  - Made the column `tripGroup` on table `DriverStatus` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "DriverStatus" ALTER COLUMN "tripGroup" SET NOT NULL;
