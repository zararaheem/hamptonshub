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
    if (!code) return json({ ok: false });
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data, error } = await sb
      .from("family_weeks").select("*").eq("access_code", code).eq("published", true).maybeSingle();
    if (error || !data) return json({ ok: false });
    return json({ ok: true, week: data });
  } catch (_e) {
    return json({ ok: false }, 500);
  }
});
