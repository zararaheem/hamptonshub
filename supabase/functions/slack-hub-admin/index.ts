// Edge function: slack-hub-admin
// Handles Slack slash commands to manage the hub access list:
//   /hub-add <email>     add someone to allowed_emails
//   /hub-remove <email>  remove someone (owner is protected)
//   /hub-list            list everyone on the access list
//
// Security:
// - Verifies Slack's request signature (HMAC over `v0:{ts}:{body}`) with the
//   app Signing Secret, plus a 5-minute replay window.
// - Only Slack user IDs in AUTHORIZED may run commands; everyone else is told
//   their own ID so the owner can add them.
// - Deployed with verify_jwt = false (Slack doesn't send a Supabase JWT);
//   the Slack signature check is the auth instead.
//
// SECRET: set SLACK_SIGNING_SECRET in the Supabase dashboard (Edge Functions ->
// slack-hub-admin -> Secrets). The live deployment has it baked in; the real
// value is intentionally kept out of version control.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const OWNER = "zara.raheem@alpha.school";
const AUTHORIZED = new Set(["U08LJ9V0Z0T"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function ephemeral(text: string) {
  return new Response(JSON.stringify({ response_type: "ephemeral", text }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function validSig(ts: string, body: string, sig: string): Promise<boolean> {
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 5) return false; // replay guard
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(SIGNING_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`v0:${ts}:${body}`));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  const expected = `v0=${hex}`;
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const raw = await req.text();
  const ts = req.headers.get("x-slack-request-timestamp") || "";
  const sig = req.headers.get("x-slack-signature") || "";
  if (!(await validSig(ts, raw, sig))) return new Response("bad signature", { status: 401 });

  const p = new URLSearchParams(raw);
  const command = (p.get("command") || "").trim();
  const text = (p.get("text") || "").trim();
  const userId = p.get("user_id") || "";

  if (!AUTHORIZED.has(userId)) {
    return ephemeral(
      `:lock: You're not authorized to manage hub access.\nYour Slack ID is \`${userId}\` — ask the hub owner to add you.`,
    );
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  // Slack auto-links emails as <mailto:x@y|x@y>; unwrap that.
  const email = text.toLowerCase().replace(/^<mailto:[^|]*\|/, "").replace(/>$/, "").trim();

  try {
    if (command === "/hub-list") {
      const { data, error } = await sb
        .from("allowed_emails").select("email,is_admin,is_owner").order("email");
      if (error) return ephemeral(`:warning: Couldn't read the list: ${error.message}`);
      const lines = (data || []).map(
        (r) => `• ${r.email}${r.is_owner ? " _(owner)_" : r.is_admin ? " _(admin)_" : ""}`,
      );
      return ephemeral(`*Hub access list (${(data || []).length})*\n${lines.join("\n")}`);
    }

    if (command === "/hub-add") {
      if (!EMAIL_RE.test(email)) return ephemeral("Usage: `/hub-add someone@alpha.school`");
      const { data: existing } = await sb
        .from("allowed_emails").select("email").eq("email", email).maybeSingle();
      if (existing) return ephemeral(`:information_source: *${email}* is already on the list.`);
      const { error } = await sb.from("allowed_emails").insert({ email, is_admin: false });
      if (error) return ephemeral(`:warning: Couldn't add ${email}: ${error.message}`);
      return ephemeral(`:white_check_mark: Added *${email}* to the hub access list.`);
    }

    if (command === "/hub-remove") {
      if (!EMAIL_RE.test(email)) return ephemeral("Usage: `/hub-remove someone@alpha.school`");
      if (email === OWNER) return ephemeral(`:no_entry: The owner (${OWNER}) can't be removed.`);
      const { data, error } = await sb
        .from("allowed_emails").delete().eq("email", email).eq("is_owner", false).select();
      if (error) return ephemeral(`:warning: Couldn't remove ${email}: ${error.message}`);
      if (!data || !data.length) return ephemeral(`:information_source: *${email}* wasn't on the list.`);
      return ephemeral(`:white_check_mark: Removed *${email}* from the hub access list.`);
    }

    return ephemeral("Unknown command. Try `/hub-add`, `/hub-remove`, or `/hub-list`.");
  } catch (e) {
    return ephemeral(`:warning: Error: ${String(e)}`);
  }
});
