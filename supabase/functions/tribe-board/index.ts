// Edge function: tribe-board
// Public (no login) read-only endpoint for the projectable live scoreboard
// at /board/. Returns tribe totals + recent awards + rosters + weekly
// highlights (incl. a themed breakdown of what earned points) for the ACTIVE
// camp week (or ?week=N). With ?format=csv it returns the full week's award
// log as CSV, so a Google Sheet can pull it live via =IMPORTDATA(...).
// Uses the service role to read past RLS; only aggregate numbers, award
// reasons, and first-name scorekeepers are exposed (no full emails).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Short scorekeeper label — name before the @, never the full email.
function whoShort(w: string): string { w = (w || "").trim(); const at = w.indexOf("@"); return at > 0 ? w.slice(0, at) : w; }

// Group a free-form award reason into a behavior theme, so the board can show
// the VARIETY of things students earned points for (not one-off call-outs).
// First match wins; unmatched reasons (bare names, etc.) return null.
const THEMES: [string, RegExp][] = [
  ["Uplifting others", /uplift/i],
  ["Helping & kindness", /help|assist|side quest|door|hold|offer|grab|support/i],
  ["Cleaning up", /clean|tidy/i],
  ["Grit & courage", /grit|persever|courage|courgae|lock(?:ing)? ?in/i],
  ["Independence", /independ/i],
  ["Community standards", /uphold|standard|communit/i],
  ["Leadership & teamwork", /leader|teammate|teamwork/i],
  ["Public speaking", /interview|speaking|present/i],
  ["Launch wins", /launch/i],
  ["Creativity", /innov|creativ|trick|rubix|rubik|goldberg|cube/i],
  ["Focus & readiness", /ready|listen|instruction|no question|timeback|coreskill|core skill|fastmath|fast math|focus/i],
];
function classify(reason: string): string | null {
  for (const [label, re] of THEMES) if (re.test(reason)) return label;
  return null;
}

function csvCell(v: unknown): string { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

// The active camp week = the first week whose end date hasn't passed (else the last week).
// An explicit ?week=N overrides.
async function resolveWeek(sb: ReturnType<typeof createClient>, override: string | null): Promise<number> {
  if (override && Number.isFinite(Number(override))) return Number(override);
  const { data } = await sb.from("family_weeks").select("week, end_date").order("week", { ascending: true });
  const rows = (data ?? []) as { week: number; end_date: string | null }[];
  const today = new Date().toISOString().slice(0, 10);
  for (const r of rows) { if (r.end_date && String(r.end_date) >= today) return r.week; }
  return rows.length ? rows[rows.length - 1].week : 1;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const url = new URL(req.url);
    const week = await resolveWeek(sb, url.searchParams.get("week"));
    const asCsv = (url.searchParams.get("format") || "").toLowerCase() === "csv";

    const { data } = await sb
      .from("tribe_awards")
      .select("tribe, points, reason, awarded_by, created_at")
      .eq("week", week)
      .order("created_at", { ascending: false });
    const rows = (data ?? []) as { tribe: string; points: number; reason: string | null; created_at: string | null; awarded_by: string | null }[];

    // CSV feed for Google Sheets (=IMPORTDATA). Oldest-first reads naturally in a sheet.
    if (asCsv) {
      const header = ["Date", "Time", "Tribe", "Points", "Reason", "Category", "Awarded by"].join(",");
      const lines = rows.slice().reverse().map((r) => {
        const dt = r.created_at ? new Date(r.created_at) : null;
        const date = dt ? dt.toLocaleDateString("en-US", { timeZone: "America/New_York" }) : "";
        const time = dt ? dt.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit" }) : "";
        const tribe = r.tribe === "helios" ? "Helios" : r.tribe === "poseidon" ? "Poseidon" : (r.tribe || "");
        const cat = (Number(r.points) || 0) > 0 ? (classify(r.reason || "") || "") : "";
        return [date, time, tribe, r.points, r.reason || "", cat, whoShort(r.awarded_by || "")].map(csvCell).join(",");
      });
      return new Response([header, ...lines].join("\n"), { headers: { ...CORS, "Content-Type": "text/csv; charset=utf-8" } });
    }

    const totals = { helios: 0, poseidon: 0 };
    rows.forEach((r) => { if (r.tribe in totals) (totals as Record<string, number>)[r.tribe] += Number(r.points) || 0; });

    // Weekly highlights — biggest single award, best day, themed breakdown.
    let biggest: { points: number; tribe: string; reason: string } | null = null;
    const byDay: Record<string, number> = {};
    const byTheme: Record<string, { points: number; awards: number }> = {};
    rows.forEach((r) => {
      const p = Number(r.points) || 0;
      if (p > 0 && (!biggest || p > biggest.points)) biggest = { points: p, tribe: r.tribe, reason: (r.reason || "").trim() };
      const d = (r.created_at || "").slice(0, 10); if (d) byDay[d] = (byDay[d] || 0) + p;
      const label = p > 0 ? classify(r.reason || "") : null;
      if (label) { (byTheme[label] ??= { points: 0, awards: 0 }); byTheme[label].points += p; byTheme[label].awards += 1; }
    });
    let bestDay: { date: string; points: number } | null = null;
    for (const d in byDay) { if (!bestDay || byDay[d] > bestDay.points) bestDay = { date: d, points: byDay[d] }; }
    const themes = Object.entries(byTheme)
      .map(([label, v]) => ({ label, points: v.points, awards: v.awards }))
      .sort((a, b) => b.points - a.points || b.awards - a.awards)
      .slice(0, 6);
    const highlights = { pointsInPlay: totals.helios + totals.poseidon, awards: rows.length, biggest, bestDay, themes };

    // Tribe rosters for this week — first names only.
    const { data: studs } = await sb.from("students").select("first, preferred, tribe").eq("week", week);
    const rosters: Record<string, string[]> = { helios: [], poseidon: [] };
    (studs ?? []).forEach((s: { first: string; preferred: string | null; tribe: string | null }) => {
      if (s.tribe === "helios" || s.tribe === "poseidon") rosters[s.tribe].push((s.preferred || s.first || "").trim());
    });
    rosters.helios.sort((a, b) => a.localeCompare(b));
    rosters.poseidon.sort((a, b) => a.localeCompare(b));

    return new Response(JSON.stringify({ ok: true, week, totals, recent: rows.slice(0, 12), rosters, highlights }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
