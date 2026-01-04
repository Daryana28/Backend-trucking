/*
  Warnings:

  - You are about to drop the `PlanMaster` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "PlanMaster";

-- CreateTable
CREATE TABLE "PlanDaily" (
    "id" SERIAL NOT NULL,
    "deliveryDate" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "group" TEXT,
    "forwardEtd" TEXT,
    "forwardEta" TEXT,
    "reverseEtd" TEXT,
    "reverseEta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanDaily_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlanDaily_deliveryDate_idx" ON "PlanDaily"("deliveryDate");

-- CreateIndex
CREATE INDEX "PlanDaily_destination_idx" ON "PlanDaily"("destination");

-- CreateIndex
CREATE UNIQUE INDEX "PlanDaily_deliveryDate_destination_key" ON "PlanDaily"("deliveryDate", "destination");
