import { syncActualTrips } from "@/lib/actualSync";
import { dayRangeEpochSecJakarta } from "@/lib/actualTrips";

let started = false;

export function startActualSyncCron() {
  if (started) return;
  started = true;

  const run = async () => {
    const today = dayRangeEpochSecJakarta(null).ymd;
    try {
      await syncActualTrips(today);
    } catch (e) {
      console.error("actual sync cron error:", e);
    }
  };

  // run immediately, then every 10 minutes
  run().catch(() => {});
  setInterval(run, 10 * 60 * 1000);
}
