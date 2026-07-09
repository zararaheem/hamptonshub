// Edge function: security-view
// Public (no login) read-only endpoint for the front-desk / security page at
// /security/. Returns the day's scheduled visitors & tours (entered by
// admissions in the hub) plus an aggregate student headcount — NEVER names.
// Uses the service role to read past RLS; only counts + visitor schedule are
// exposed, no student PII.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// Today in America/New_York as YYYY-MM-DD.
function nyToday(): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date ?? "")) ? String(body.date) : nyToday();
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Visitors & tours for the day (entered by admissions; stored in app_state).
    const { data: vs } = await sb.from("app_state").select("data").eq("key", `visitors:${day}`).maybeSingle();
    const raw = Array.isArray(vs?.data) ? vs!.data : [];
    const visitors = raw.map((v: Record<string, unknown>) => ({
      time: String(v.time ?? ""),
      name: String(v.name ?? ""),
      purpose: String(v.purpose ?? ""),
      party: Number(v.party) || 0,
      status: String(v.status ?? ""),
    })).filter((v) => v.name || v.time || v.purpose);
    const parties = visitors.length;
    const heads = visitors.reduce((a, v) => a + (v.party || 0), 0);

    // Aggregate student headcount for the week that contains `day` (count only).
    let studentsEnrolled = 0, weekN: number | null = null;
    const { data: fw } = await sb.from("family_weeks").select("week")
      .lte("start_date", day).gte("end_date", day).maybeSingle();
    if (fw) {
      weekN = fw.week as number;
      const { count } = await sb.from("students").select("*", { count: "exact", head: true })
        .eq("week", weekN).eq("withdrawn", false);
      studentsEnrolled = count ?? 0;
    }

    return json({ ok: true, day, weekN, studentsEnrolled, visitors, parties, heads });
  } catch (_e) {
    return json({ ok: false }, 500);
  }
});
