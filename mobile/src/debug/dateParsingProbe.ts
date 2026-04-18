// mobile/src/debug/dateParsingProbe.ts
const weekdayName = (d: number) =>
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d] ?? String(d);

export function parseLocalDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  // Local midnight (important: avoids UTC parse ambiguity of YYYY-MM-DD)
  return new Date(y, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0);
}

function dump(label: string, dt: Date) {
  console.log(`  ${label}.toString()  ->`, dt.toString());
  console.log(`  ${label}.toISOString()->`, dt.toISOString());
  console.log(
    `  ${label}.getDay/getDate ->`,
    dt.getDay(),
    weekdayName(dt.getDay()),
    "/",
    dt.getDate()
  );
}

export function runDateParsingProbe() {
  const samples = [
    "2026-01-12",
    "2026-01-13",
    "2026-06-01",
    "2026-12-31",
    "2026-03-08",
    "2026-11-01",
  ];

  console.log("🧪 [DATE PROBE] start");
  console.log("🧪 [DATE PROBE] device timezone offset (min):", new Date().getTimezoneOffset());

  for (const s of samples) {
    console.log(`\n🧪 [DATE PROBE] sample: ${s}`);

    const utcParsed = new Date(s); // ambiguous: may be treated as UTC
    const localParsed = parseLocalDate(s); // safe: local midnight

    dump("UTC_PARSE(new Date(str))", utcParsed);
    dump("LOCAL_PARSE(parseLocalDate)", localParsed);

    const mismatch =
      utcParsed.getDay() !== localParsed.getDay() ||
      utcParsed.getDate() !== localParsed.getDate();

    if (mismatch) {
      console.log("⚠️ MISMATCH UTC vs LOCAL for", s);
    } else {
      console.log("✅ Same day for", s);
    }
  }

  console.log("\n🧪 [DATE PROBE] end");
}

