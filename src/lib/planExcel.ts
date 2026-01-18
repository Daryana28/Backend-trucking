import * as XLSX from "xlsx";

type ParsedRow = {
  deliveryDate: string; // YYYY-MM-DD
  destination: string;
  group: string;
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
  const s = s0.replace(/\s+/g, "");

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

export function buildPlanTemplateXlsxBuffer() {
  const header = [
    [
      "deliveryDate",
      "destination",
      "group",
      "forwardEtd",
      "forwardEta",
      "reverseEtd",
      "reverseEta",
    ],
  ];

  const sample = [
    [
      "2026-01-04",
      "YIMM PG LOKAL PO 1",
      "Yamaha Pulogadung Lokal",
      "05:00",
      "08:00",
      "10:00",
      "13:00",
    ],
    [
      "2026-01-04",
      "YIMM KARAWANG PO 1",
      "Yamaha Karawang",
      "05:00",
      "08:00",
      "10:00",
      "13:00",
    ],
    [
      "2026-01-04",
      "YIMM PG EXPORT C1",
      "Yamaha Pg export",
      "05:00",
      "08:00",
      "10:00",
      "13:00",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([...header, ...sample]);

  ws["!cols"] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PLAN");

  // ✅ README sheet: supaya user ngerti nilai kolom `group` harus apa
  const readme = XLSX.utils.aoa_to_sheet([
    ["NOTE"],
    [
      "Kolom `group` WAJIB sama dengan grouping di Dashboard (customer label). Jika tidak sama, plan tidak akan terbaca untuk perbandingan realtime.",
    ],
    [""],
    ["Valid group/customer:"],
    ...VALID_GROUPS.map((g) => [g]),
    [""],
    ["Master plate → customer:"],
    ...Object.entries(CUSTOMER_BY_PLATE).map(([plate, cust]) => [plate, cust]),
    [""],
    ["Contoh:"],
    [
      "deliveryDate=2026-01-04, destination=YIMM KARAWANG PO 1, group=Yamaha Karawang",
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

  // ✅ defval keeps empty cells, raw keeps values (number/date)
  const json = XLSX.utils.sheet_to_json(ws, { defval: "", raw: true }) as any[];

  if (!json.length) {
    return { rows: [], errors: ["File kosong. Isi minimal 1 baris data."] };
  }

  const required = [
    "deliveryDate",
    "destination",
    "group",
    "forwardEtd",
    "forwardEta",
    "reverseEtd",
    "reverseEta",
  ];

  const keys = Object.keys(json[0] ?? {});
  for (const k of required) {
    if (!keys.includes(k)) errors.push(`Kolom wajib tidak ada: ${k}`);
  }
  if (errors.length) return { rows: [], errors };

  json.forEach((r, i) => {
    const line = i + 2;

    const deliveryDate = normStr(r.deliveryDate);
    const destination = normStr(r.destination);
    const group = normalizeGroup(r.group);

    const forwardEtd = normTime(r.forwardEtd);
    const forwardEta = normTime(r.forwardEta);
    const reverseEtd = normTime(r.reverseEtd);
    const reverseEta = normTime(r.reverseEta);

    if (!deliveryDate) errors.push(`Line ${line}: deliveryDate kosong`);
    else if (!isYmd(deliveryDate))
      errors.push(`Line ${line}: deliveryDate harus YYYY-MM-DD`);

    if (!destination) errors.push(`Line ${line}: destination kosong`);
    if (!group) errors.push(`Line ${line}: group kosong`);

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
