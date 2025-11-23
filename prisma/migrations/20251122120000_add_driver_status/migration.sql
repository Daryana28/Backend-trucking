-- CreateTable
CREATE TABLE "DriverStatus" (
    "driverId" TEXT NOT NULL,
    "plate" TEXT,
    "destination" TEXT,
    "etdTime" TEXT,
    "etaTime" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverStatus_pkey" PRIMARY KEY ("driverId")
);

-- AddForeignKey
ALTER TABLE "DriverStatus" ADD CONSTRAINT "DriverStatus_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
