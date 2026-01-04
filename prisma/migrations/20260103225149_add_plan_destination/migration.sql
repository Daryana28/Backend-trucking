-- CreateTable
CREATE TABLE "PlanDestination" (
    "id" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "etd" TEXT NOT NULL,
    "eta" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanDestination_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanDestination_destination_key" ON "PlanDestination"("destination");
