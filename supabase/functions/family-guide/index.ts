// Edge function: family-guide
// Public (no JWT) endpoint for the parent-facing weekly guide page (guide.html).
// Takes { code } and returns that week's family_weeks row ONLY if it's published.
// Uses the service role to read past RLS; the access code is the gate.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body.code ?? "").trim();
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    let week = null;
    if (code) {
      // A specific week link: case-insensitive code match (published only).
      const { data } = await sb
        .from("family_weeks").select("*").ilike("access_code", code).eq("published", true).maybeSingle();
      week = data;
    } else {
      // Bare URL: show the current published week (by date), else next upcoming, else latest.
      const { data } = await sb
        .from("family_weeks").select("*").eq("published", true).order("week");
      const rows = data || [];
      const today = new Date().toISOString().slice(0, 10);
      const d = (v: unknown) => String(v || "").slice(0, 10);
      week = rows.find((w) => d(w.start_date) && d(w.end_date) && d(w.start_date) <= today && today <= d(w.end_date))
        || rows.find((w) => d(w.start_date) && d(w.start_date) >= today)
        || rows[rows.length - 1] || null;
    }
    if (!week) return json({ ok: false });
    return json({ ok: true, week });
  } catch (_e) {
    return json({ ok: false }, 500);
  }
});
