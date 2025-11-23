/*
  Warnings:

  - You are about to drop the column `destination` on the `Shipment` table. All the data in the column will be lost.
  - You are about to drop the column `origin` on the `Shipment` table. All the data in the column will be lost.
  - Added the required column `destinationName` to the `Shipment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `originName` to the `Shipment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "isEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isStart" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Shipment" DROP COLUMN "destination",
DROP COLUMN "origin",
ADD COLUMN     "destinationLat" DOUBLE PRECISION,
ADD COLUMN     "destinationLng" DOUBLE PRECISION,
ADD COLUMN     "destinationName" TEXT NOT NULL,
ADD COLUMN     "originLat" DOUBLE PRECISION,
ADD COLUMN     "originLng" DOUBLE PRECISION,
ADD COLUMN     "originName" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'Not Started';
