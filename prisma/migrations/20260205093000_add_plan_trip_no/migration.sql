-- Add tripNo column and update unique constraint for PlanDaily
ALTER TABLE "PlanDaily" ADD COLUMN     "tripNo" INTEGER NOT NULL DEFAULT 1;

-- Drop old unique constraint (deliveryDate, destination)
ALTER TABLE "PlanDaily" DROP CONSTRAINT "uniq_plan_daily_date_destination";

-- New unique constraint with tripNo
CREATE UNIQUE INDEX "uniq_plan_daily_date_destination_tripNo"
ON "PlanDaily"("deliveryDate", "destination", "tripNo");
