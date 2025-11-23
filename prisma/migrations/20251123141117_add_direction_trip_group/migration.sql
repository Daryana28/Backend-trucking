-- AlterTable
ALTER TABLE "DriverStatus" ADD COLUMN     "isFinished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tripGroup" TEXT;
