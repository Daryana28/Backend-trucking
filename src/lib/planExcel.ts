import * as XLSX from "xlsx";

type ParsedRow = {
  deliveryDate: string; // YYYY-MM-DD
  destination: string;
  group: string;
  tripCount: number;
  forwardEtd: string;
  forwardEta: string;
  reverseEtd: string;
  reverseEta: string;
};

// ================================
// ✅ CUSTOMER MASTER (group values must match dashboard grouping)
// ================================
const CUSTOMER_BY_PLATE: Record<string, string> = {
  "T 9521 AB": "Yamaha Pulogadung Lokal",
  "T 9473 AB": "Yamaha Karawang",
  "T 8854 DH": "Yamaha Pg export",
  "T 9508 AB": "Yamaha Karawang",
  "T 9472 AB": "Yamaha Pulogadung Lokal",
};

const VALID_GROUPS = Array.from(
  new Set(Object.values(CUSTOMER_BY_PLATE).map((x) => String(x ?? "").trim()))
).filter(Boolean);

function normalizeGroup(input: any) {
  return String(input ?? "").trim();
}

function isYmd(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test((s ?? "").trim());
}

function normStr(v: any) {
  return String(v ?? "").trim();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function fmtJakartaYmd(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isValidMonthDay(m: number, d: number) {
  if (!Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  return true;
}

function normDate(v: any) {
  if (v === null || v === undefined) return "";

  if (v instanceof Date && !isNaN(v.getTime())) {
    // Use Jakarta date parts to avoid timezone shifts from Excel dates
    const ymd = fmtJakartaYmd(v);
    const m = Number(ymd.slice(5, 7));
    const d = Number(ymd.slice(8, 10));
    if (!isValidMonthDay(m, d)) return "";
    return ymd;
  }

  if (typeof v === "number" && Number.isFinite(v)) {
    const parsed =
      (XLSX as any)?.SSF?.parse_date_code?.(v) ??
      null;
    if (parsed && parsed.y && parsed.m && parsed.d) {
      const y = parsed.y;
      const m = pad2(parsed.m);
      const d = pad2(parsed.d);
      if (!isValidMonthDay(Number(m), Number(d))) return "";
      return `${y}-${m}-${d}`;
    }
  }

  const s0 = normStr(v);
  if (!s0) return "";
  const s = s0.trim();

  // Format: YYYY-MM-DD or YYYY/MM/DD
  const iso = s.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})$/);
  if (iso) {
    const yyyy = iso[1];
    const mmNum = Number(iso[2]);
    const ddNum = Number(iso[3]);
    if (!isValidMonthDay(mmNum, ddNum)) return "";
    const mm = pad2(mmNum);
    const dd = pad2(ddNum);
    return `${yyyy}-${mm}-${dd}`;
  }

  // Format: DD/MM/YYYY or DD-MM-YYYY or DD/MM/YY
  const dmy = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const useMdy = a <= 12 && b > 12;
    const ddNum = useMdy ? b : a;
    const mmNum = useMdy ? a : b;
    if (!isValidMonthDay(mmNum, ddNum)) return "";
    const dd = pad2(ddNum);
    const mm = pad2(mmNum);
    let yyyy = dmy[3];
    if (yyyy.length === 2) yyyy = `20${yyyy}`;
    return `${yyyy}-${mm}-${dd}`;
  }

  // Format: DD MMM YYYY / DD-MMM-YYYY / DD-MMM
  const m2 = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[\s-]?(\d{2,4})?$/);
  if (m2) {
    const dd = pad2(Number(m2[1]));
    const mon = m2[2].toLowerCase();
    const monthMap: Record<string, string> = {
      jan: "01",
      feb: "02",
      mar: "03",
      apr: "04",
      may: "05",
      jun: "06",
      jul: "07",
      aug: "08",
      sep: "09",
      oct: "10",
      nov: "11",
      dec: "12",
      mei: "05",
      agu: "08",
      okt: "10",
      des: "12",
    };
    const mm = monthMap[mon];
    if (mm) {
      let yyyy = m2[3] ?? "";
      if (!yyyy) {
        const parts = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
        }).formatToParts(new Date());
        yyyy = parts.find((p) => p.type === "year")?.value ?? "";
      } else if (yyyy.length === 2) {
        yyyy = `20${yyyy}`;
      }
      if (yyyy) return `${yyyy}-${mm}-${dd}`;
    }
  }

  return s;
}

/**
 * Convert Excel time representations into "HH:mm"
 * Accepts:
 * - "05:00", "5:00"
 * - number (Excel time serial: fraction of day)
 * - Date object
 * - "05:00:00" (will trim seconds)
 */
function normTime(v: any) {
  if (v === null || v === undefined) return "";

  // Excel can return Date
  if (v instanceof Date && !isNaN(v.getTime())) {
    const hh = v.getHours();
    const mm = v.getMinutes();
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  // Excel can return time as number (fraction of day)
  if (typeof v === "number" && isFinite(v)) {
    // if it's a typical excel time fraction (0..1)
    // handle also cases where it might be like 0.5 etc.
    const totalMinutes = Math.round(v * 24 * 60);
    const hh = Math.floor((totalMinutes % (24 * 60)) / 60);
    const mm = totalMinutes % 60;
    return `${pad2(hh)}:${pad2(mm)}`;
  }

  // Strings / other
  const s0 = normStr(v);
  if (!s0) return "";

  // trim seconds if present: "05:00:00" => "05:00"
  const s = s0.replace(/\s+/g, "").replace(/\./g, ":");

  // Match H:mm or HH:mm or HH:mm:ss
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${pad2(hh)}:${pad2(mm)}`;
    }
    return s; // let validator catch invalid ranges
  }

  return s; // let validator catch
}

function normTrip(v: any) {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.max(0, Math.floor(v));
  }
  const s = normStr(v);
  if (!s) return 0;
  const n = Number(s);
  if (!Number.isFinite(n)) return NaN;
  return Math.max(0, Math.floor(n));
}

function extractGroupFromDestination(dest: string) {
  const s = String(dest ?? "").trim();
  if (!s) return "";
  const m = s.match(/\(([^)]+)\)\s*$/);
  if (m && m[1]) return String(m[1]).trim();
  return "";
}

export function buildPlanTemplateXlsxBuffer() {
  const header = [["Date", "Destinasi", "ETD", "ETA", "Trip"]];

  const rows = Object.entries(CUSTOMER_BY_PLATE)
    .map(([plate, group]) => [`${plate} (${group})`, group])
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([destLabel]) => ["", destLabel, "", "", ""]);

  const ws = XLSX.utils.aoa_to_sheet([...header, ...rows]);

  ws["!cols"] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PLAN");

  // ✅ README sheet: petunjuk format
  const readme = XLSX.utils.aoa_to_sheet([
    ["NOTE"],
    [
      "Isi kolom Date (bisa: YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY), ETD (HH:mm), ETA (HH:mm), dan Trip (angka). Destinasi sudah disediakan.",
    ],
    [""],
    ["Valid destinasi (ikuti template):"],
    ...Object.entries(CUSTOMER_BY_PLATE)
      .map(([plate, group]) => `${plate} (${group})`)
      .sort((a, b) => a.localeCompare(b))
      .map((v) => [v]),
    [""],
    ["Master plate → customer:"],
    ...Object.entries(CUSTOMER_BY_PLATE).map(([plate, cust]) => [plate, cust]),
    [""],
    ["Contoh:"],
    [
      "Date=2026-01-04, Destinasi=T 9473 AB (Yamaha Karawang), ETD=05:00, ETA=08:00, Trip=3",
    ],
  ]);
  readme["!cols"] = [{ wch: 24 }, { wch: 40 }, { wch: 60 }];
  XLSX.utils.book_append_sheet(wb, readme, "README");

  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return out as Buffer;
}

export function parsePlanXlsx(ab: ArrayBuffer) {
  const errors: string[] = [];
  const rows: ParsedRow[] = [];

  const buf = Buffer.from(ab);
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true }); // ✅ important

  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) {
    return { rows: [], errors: ["Sheet tidak ditemukan."] };
  }

  const ws = wb.Sheets[sheetName];

  // ✅ defval keeps empty cells, raw=false to use formatted strings (avoids timezone shifts)
  const json = XLSX.utils.sheet_to_json(ws, {
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd",
  }) as any[];

  if (!json.length) {
    return { rows: [], errors: ["File kosong. Isi minimal 1 baris data."] };
  }

  const keys = Object.keys(json[0] ?? {});
  const hasLegacy = ["deliveryDate", "destination"].every((k) =>
    keys.includes(k),
  );
  const hasSimple = ["Date", "Destinasi", "ETD", "ETA"].every((k) =>
    keys.includes(k),
  );

  if (!hasLegacy && !hasSimple) {
    return {
      rows: [],
      errors: [
        "Kolom wajib tidak ada. Gunakan template terbaru dari tombol Download Template.",
      ],
    };
  }

  json.forEach((r, i) => {
    const line = i + 2;

    const deliveryDate = hasLegacy
      ? normDate(r.deliveryDate)
      : normDate(r.Date);
    const destination = hasLegacy
      ? normStr(r.destination)
      : normStr(r.Destinasi);
    let group = hasLegacy ? normalizeGroup(r.group) : "";

    const forwardEtd = hasLegacy ? normTime(r.forwardEtd) : normTime(r.ETD);
    const forwardEta = hasLegacy ? normTime(r.forwardEta) : normTime(r.ETA);
    const reverseEtd = hasLegacy ? normTime(r.reverseEtd) : "";
    const reverseEta = hasLegacy ? normTime(r.reverseEta) : "";
    const tripCount = hasLegacy ? 0 : normTrip(r.Trip);

    if (!group && destination) {
      const inferred = extractGroupFromDestination(destination);
      if (inferred && VALID_GROUPS.includes(inferred)) {
        group = inferred;
      } else if (VALID_GROUPS.includes(destination)) {
        group = destination;
      }
    }

    if (!deliveryDate)
      errors.push(
        `Line ${line}: ${hasLegacy ? "deliveryDate" : "Date"} kosong`,
      );
    else if (!isYmd(deliveryDate))
      errors.push(
        `Line ${line}: ${
          hasLegacy ? "deliveryDate" : "Date"
        } harus YYYY-MM-DD`,
      );

    if (!destination) errors.push(`Line ${line}: destination kosong`);
    if (!group) errors.push(`Line ${line}: group kosong`);
    if (!hasLegacy && Number.isNaN(tripCount)) {
      errors.push(`Line ${line}: Trip harus angka`);
    }

    // ✅ important: group harus match customer label supaya dashboard bisa join plan vs realtime
    if (group && VALID_GROUPS.length && !VALID_GROUPS.includes(group)) {
      errors.push(
        `Line ${line}: group tidak dikenal (${group}). Gunakan salah satu: ${VALID_GROUPS.join(
          ", "
        )}`
      );
    }

    const timeFields: Array<[string, string]> = [
      ["forwardEtd", forwardEtd],
      ["forwardEta", forwardEta],
      ["reverseEtd", reverseEtd],
      ["reverseEta", reverseEta],
    ];

    for (const [k, v] of timeFields) {
      if (v && !/^\d{2}:\d{2}$/.test(v)) {
        errors.push(`Line ${line}: ${k} harus HH:mm (contoh 05:00)`);
      }
    }

    rows.push({
      deliveryDate,
      destination,
      group,
      tripCount: Number.isFinite(tripCount) ? tripCount : 0,
      forwardEtd,
      forwardEta,
      reverseEtd,
      reverseEta,
    });
  });

  // Deduplicate: deliveryDate + destination
  const seen = new Set<string>();
  for (const r of rows) {
    const key = `${r.deliveryDate}__${r.destination}`;
    if (seen.has(key)) {
      errors.push(
        `Duplicate: kombinasi deliveryDate + destination sama (${r.deliveryDate} - ${r.destination})`
      );
    }
    seen.add(key);
  }

  return { rows, errors };
}
