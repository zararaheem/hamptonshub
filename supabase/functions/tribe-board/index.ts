// Edge function: tribe-board
// Public (no login) read-only endpoint for the projectable live scoreboard
// at /board/. Returns tribe totals + recent awards. Uses the service role to
// read past RLS; only two numbers and award reasons are exposed (not sensitive).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data } = await sb
      .from("tribe_awards")
      .select("tribe, points, reason, awarded_by, created_at")
      .order("created_at", { ascending: false });
    const rows = data ?? [];
    const totals = { helios: 0, poseidon: 0 };
    rows.forEach((r: { tribe: string; points: number }) => {
      if (r.tribe in totals) (totals as Record<string, number>)[r.tribe] += Number(r.points) || 0;
    });
    return new Response(JSON.stringify({ ok: true, totals, recent: rows.slice(0, 12) }), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ ok: false }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
