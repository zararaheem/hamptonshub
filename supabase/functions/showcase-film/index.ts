// Edge function: showcase-film
// Public (no JWT) endpoint. Given { week, item, code }, returns a trailer's
// video/download links ONLY when the film is published AND the code matches a
// student code for that trailer. Uses the service role so the links and the
// code list are never exposed to the client until a valid code is entered.

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
const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const week = parseInt(String(body.week ?? ""), 10);
    const item = String(body.item ?? "").trim();
    const code = norm(body.code);
    if (!week || !item) return json({ ok: false, error: "missing week/item" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: film } = await sb
      .from("showcase_films").select("video_url,download_url,published").eq("week", week).eq("item", item).maybeSingle();

    if (!film || !film.published) return json({ ok: true, status: "coming_soon" });

    const { data: codes } = await sb
      .from("showcase_film_codes").select("code").eq("week", week).eq("item", item);
    const codeSet = (codes || []).map((r) => norm(r.code));

    // Published with no codes configured → open to anyone with the link.
    if (codeSet.length === 0) {
      return json({ ok: true, status: "ready", video_url: film.video_url, download_url: film.download_url });
    }
    if (!code) return json({ ok: true, status: "need_code" });
    if (codeSet.includes(code)) {
      return json({ ok: true, status: "ready", video_url: film.video_url, download_url: film.download_url });
    }
    return json({ ok: true, status: "bad_code" });
  } catch (_e) {
    return json({ ok: false, status: "error" }, 500);
  }
});
