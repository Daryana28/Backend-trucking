/*
  Warnings:

  - You are about to drop the `PlanDestination` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "PlanDestination";

-- CreateTable
CREATE TABLE "PlanMaster" (
    "id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "forwardEtd" TEXT NOT NULL,
    "forwardEta" TEXT NOT NULL,
    "reverseEtd" TEXT NOT NULL,
    "reverseEta" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanMaster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanMaster_destination_key" ON "PlanMaster"("destination");
