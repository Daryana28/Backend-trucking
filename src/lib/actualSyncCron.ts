import { syncActualTrips } from "@/lib/actualSync";
import { dayRangeEpochSecJakarta } from "@/lib/actualTrips";

let started = false;
let backfillDone = false;

function ymdJakarta(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function dayOffsetJakartaYmd(offsetDays: number) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return ymdJakarta(d);
}

export function startActualSyncCron() {
  if (started) return;
  started = true;

  const intervalMinRaw = Number(process.env.ACTUAL_SYNC_INTERVAL_MIN ?? "10");
  const intervalMin = Number.isFinite(intervalMinRaw)
    ? Math.max(1, Math.floor(intervalMinRaw))
    : 10;

  const run = async () => {
    const today = dayRangeEpochSecJakarta(null).ymd;
    try {
      await syncActualTrips(today);
    } catch (e) {
      console.error("actual sync cron error:", e);
    }
  };

  const runBackfill = async () => {
    if (backfillDone) return;
    backfillDone = true;
    const n = Number(process.env.ACTUAL_SYNC_BACKFILL_DAYS ?? "0");
    if (!Number.isFinite(n) || n <= 0) return;
    for (let i = 1; i <= n; i += 1) {
      const ymd = dayOffsetJakartaYmd(i);
      try {
        await syncActualTrips(ymd);
      } catch (e) {
        console.error("actual sync backfill error:", ymd, e);
      }
    }
  };

  // run immediately, then every 10 minutes
  runBackfill().catch(() => {});
  run().catch(() => {});
  setInterval(run, intervalMin * 60 * 1000);
}
