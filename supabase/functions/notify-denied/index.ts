// Edge function: notify-denied
// Posts a Slack message (and logs to public.access_attempts) when someone signs
// in with Google but is NOT on the allow-list (public.allowed_emails).
//
// Called by the hub from tryEnter() when access is denied, while the user's
// session JWT is still valid. The caller's identity is taken from that JWT, so
// the client cannot spoof which email gets reported.
//
// SECRET: set SLACK_WEBHOOK_URL in the Supabase dashboard
//   (Edge Functions -> notify-denied -> Secrets) or via the CLI:
//   supabase secrets set SLACK_WEBHOOK_URL="https://hooks.slack.com/services/..."
// The live deployment has the webhook baked in; the real URL is intentionally
// kept out of version control.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SLACK_WEBHOOK_URL = Deno.env.get("SLACK_WEBHOOK_URL")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "missing token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Identify the caller from their JWT (don't trust client-sent email).
    const { data: ures, error: uerr } = await admin.auth.getUser(token);
    const user = ures?.user;
    if (uerr || !user?.email) return json({ error: "invalid token" }, 401);

    const email = user.email.toLowerCase();
    const fullName =
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.name as string) ||
      "";

    // If they're actually on the allow-list, this isn't a denial — do nothing.
    const { data: allowed } = await admin
      .from("allowed_emails")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (allowed) return json({ ok: true, skipped: "allowed" });

    // Log the denied attempt.
    await admin
      .from("access_attempts")
      .insert({ email, user_id: user.id, full_name: fullName });

    // Notify Slack.
    const who = fullName ? `${fullName} (${email})` : email;
    const text =
      `:no_entry: *Hamptons Hub — denied sign-in*\n` +
      `*${who}* signed in with Google but isn't on the access list.\n` +
      `<https://hamptonshub.vercel.app|Open the hub> and add them in the Access tab if they belong.`;

    const slackRes = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    return json({ ok: true, slack: slackRes.status });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
