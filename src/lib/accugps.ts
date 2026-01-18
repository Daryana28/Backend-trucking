// src/lib/accugps.ts

type LoginResponse = {
  status?: number;
  message?: string;
  data?: { access_token?: string };
};

const CACHE = {
  token: null as string | null,
  expiresAt: 0, // epoch ms
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function baseUrl() {
  const u = mustEnv("ACCGPS_BASE_URL").trim();
  return u.endsWith("/") ? u.slice(0, -1) : u;
}

async function loginAccuGps(): Promise<string> {
  const url = `${baseUrl()}/api/open/v1/login`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: mustEnv("ACCGPS_USERNAME"),
      password: mustEnv("ACCGPS_PASSWORD"),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AccuGPS login failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as LoginResponse;
  const token = json?.data?.access_token;
  if (!token) throw new Error("AccuGPS login: access_token missing");

  CACHE.token = token;
  CACHE.expiresAt = Date.now() + 2.5 * 24 * 60 * 60 * 1000;

  return token;
}

async function getToken(): Promise<string> {
  if (CACHE.token && Date.now() < CACHE.expiresAt) return CACHE.token;
  return loginAccuGps();
}

export function normalizeCoord(v: number) {
  if (typeof v === "number" && isFinite(v) && Math.abs(v) > 180)
    return v / 3600000;
  return v;
}

export async function accugpsFetch<T>(path: string): Promise<T> {
  const token = await getToken();
  const url = `${baseUrl()}${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, {
    headers: {
      "content-type": "application/json",
      access_token: token,
    },
    cache: "no-store",
  });

  if (res.status === 401 || res.status === 403) {
    CACHE.token = null;
    CACHE.expiresAt = 0;

    const token2 = await getToken();
    const res2 = await fetch(url, {
      headers: {
        "content-type": "application/json",
        access_token: token2,
      },
      cache: "no-store",
    });

    if (!res2.ok) {
      const text = await res2.text().catch(() => "");
      throw new Error(`AccuGPS fetch failed: ${res2.status} ${text}`);
    }
    return (await res2.json()) as T;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`AccuGPS fetch failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}

/** -------- Types -------- */

export type AccuGpsTracker = {
  id?: string;
  sn?: string;
  alias?: string;
  login?: number;
  is_shared?: number;
  longitude?: number;
  latitude?: number;
  degree?: number;
  speed?: number;
  location_time?: number;
};

export type AccuGpsTrackerLocationRow = {
  id?: string;
  sn?: string;
  alias?: string;
  speed?: number;
  location?: {
    latitude?: number;
    longitude?: number;
    speed?: number;
    gps_time?: string;
    upload_time?: string;
    degree?: number;
    location_time?: number;
  };
};

export type AccuGpsAlertRow = {
  type?: string;
  time?: string | number;
  timestamp?: number;
  poi_name?: string;
  fence_name?: string;
  latitude?: number;
  longitude?: number;
};

/** PDF TRACK response shape: segments + stopping_points */
export type AccuGpsTrackPoint = {
  latitude?: number;
  longitude?: number;
  speed?: number; // biasanya km/h di track response
  degree?: number;
  location_time?: number; // epoch sec
  end_time?: number; // epoch sec (kadang ada)
};

export type AccuGpsTrackStoppingPoint = {
  latitude?: number;
  longitude?: number;
  speed?: number;
  location_time?: number;
  start_time?: number;
  start_driving_time?: number;
  distance?: number;
};

export type AccuGpsTrackResponse = {
  status?: number;
  message?: string;
  data?: {
    segments?: AccuGpsTrackPoint[][];
    stopping_points?: AccuGpsTrackStoppingPoint[];
    total?: any;
    hash_?: string;
  };
};

export async function accugpsListTrackers() {
  return accugpsFetch<{
    status?: number;
    message?: string;
    data?: AccuGpsTracker[];
  }>("/api/open/v1/trackers");
}

export async function accugpsTrackersLocation() {
  return accugpsFetch<{
    status?: number;
    message?: string;
    data?: AccuGpsTrackerLocationRow[];
  }>("/api/open/v1/trackers/location");
}

export async function accugpsTrackerAlerts(
  trackerId: string,
  startTimeSec: number,
  endTimeSec: number,
) {
  const qs = new URLSearchParams({
    start_time: String(startTimeSec),
    end_time: String(endTimeSec),
  });

  return accugpsFetch<{
    status?: number;
    message?: string;
    data?: AccuGpsAlertRow[];
  }>(
    `/api/open/v1/trackers/${encodeURIComponent(trackerId)}/alerts?${qs.toString()}`,
  );
}

/**
 * ✅ INI YANG KAMU BUTUH UNTUK POLYLINE/HISTORY:
 * Endpoint track di PDF: /api/open/v1/trackers/{sn}/track
 */
export async function accugpsTrackerTrackBySn(
  sn: string,
  startTimeSec: number,
  endTimeSec: number,
) {
  const qs = new URLSearchParams({
    start_time: String(startTimeSec),
    end_time: String(endTimeSec),
  });

  return accugpsFetch<AccuGpsTrackResponse>(
    `/api/open/v1/trackers/${encodeURIComponent(sn)}/track?${qs.toString()}`,
  );
}
