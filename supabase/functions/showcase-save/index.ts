// Edge function: showcase-save
// Public endpoint that lets a guide edit the showcase page copy after entering
// the edit password. The password is checked server-side (never trusted from
// the client alone), and the write happens with the service role.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const EDIT_PW = Deno.env.get("SHOWCASE_EDIT_PW") || "adminreview6";

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
    const password = String(body.password ?? "");
    const week = parseInt(String(body.week ?? ""), 10);
    const data = body.data;
    if (password !== EDIT_PW) return json({ ok: false, status: "bad_password" });
    if (!week) return json({ ok: false, status: "bad_week" });
    if (!data || typeof data !== "object" || Array.isArray(data)) return json({ ok: false, status: "bad_data" });
    if (JSON.stringify(data).length > 60000) return json({ ok: false, status: "too_large" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { error } = await sb.from("showcase_config")
      .upsert({ week, data, updated_at: new Date().toISOString() });
    if (error) return json({ ok: false, status: "save_failed", error: error.message });
    return json({ ok: true });
  } catch (_e) {
    return json({ ok: false, status: "error" }, 500);
  }
});
