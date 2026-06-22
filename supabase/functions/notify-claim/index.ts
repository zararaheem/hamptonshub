// Edge function: notify-claim
// Posts a Slack message when a signed-in user links a NEW email to their hub
// access via the name-match claim flow (public.claim_access). Called by the hub
// right after a successful link, while the user's session JWT is valid.
//
// SECRET: set SLACK_WEBHOOK_URL in the Supabase dashboard. The live deployment
// has the webhook baked in; the real value is kept out of version control.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_URL")!;
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
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "missing token" }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: ures, error: uerr } = await admin.auth.getUser(token);
    const user = ures?.user;
    if (uerr || !user?.email) return json({ error: "invalid token" }, 401);
    const email = user.email.toLowerCase();
    const name =
      (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || "";
    const who = name ? `${name}` : email;
    const text =
      `:link: *Hamptons Hub — email linked*\n` +
      `*${who}* signed in with a new address *${email}* that matched their name on the access list, confirmed it, and was let in.\n` +
      `<https://hamptonshub.vercel.app|Review access> in the Access tab.`;
    const r = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, username: "Hamptons Hub", icon_emoji: ":anchor:" }),
    });
    return json({ ok: true, slack: r.status });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
