// Edge function: tribe-award
// Slack slash-command endpoint for the Tribe Scoreboard. Staff in the
// #tribe-games channel type e.g.  /point helios 3 won the relay
// and this appends to public.tribe_awards; the hub scoreboard updates live.
//
// verify_jwt is FALSE — Slack does not send a Supabase JWT. Requests are
// authenticated by verifying Slack's signing secret (SLACK_SIGNING_SECRET).
//
// Slack app setup (one time):
//   1. api.slack.com/apps → your app → Slash Commands → Create New Command
//        Command: /point   Request URL: <this function's URL>
//        (URL shown in Supabase → Edge Functions → tribe-award)
//   2. Basic Information → copy the "Signing Secret".
//   3. Supabase → Project Settings → Edge Functions → add secret
//        SLACK_SIGNING_SECRET = <that value>
//   4. Install/reinstall the app to your workspace, invite it to #tribe-games.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") ?? "";

const TRIBES: Record<string, string> = {
  helios: "helios", sun: "helios", gold: "helios", yellow: "helios", "☀️": "helios",
  poseidon: "poseidon", sea: "poseidon", ocean: "poseidon", blue: "poseidon", water: "poseidon", trident: "poseidon", "🔱": "poseidon", "🌊": "poseidon",
};
const NICE: Record<string, string> = { helios: "☀️ Helios", poseidon: "🔱 Poseidon" };

const reply = (text: string, inChannel = false) =>
  new Response(JSON.stringify({ response_type: inChannel ? "in_channel" : "ephemeral", text }), {
    headers: { "Content-Type": "application/json" },
  });

async function verifySlack(req: Request, raw: string): Promise<boolean> {
  if (!SIGNING_SECRET) return true; // not configured yet — allow (set the secret to lock down)
  const ts = req.headers.get("x-slack-request-timestamp") ?? "";
  const sig = req.headers.get("x-slack-signature") ?? "";
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // replay guard
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${raw}`));
  const mine = "v0=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  // constant-time-ish compare
  if (mine.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < mine.length; i++) diff |= mine.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

async function totals(sb: ReturnType<typeof createClient>) {
  const { data } = await sb.from("tribe_awards").select("tribe, points");
  const t = { helios: 0, poseidon: 0 };
  (data ?? []).forEach((r: { tribe: string; points: number }) => {
    if (r.tribe in t) (t as Record<string, number>)[r.tribe] += Number(r.points) || 0;
  });
  return t;
}
const scoreLine = (t: { helios: number; poseidon: number }) =>
  `☀️ *Helios ${t.helios}*  —  ${t.poseidon} *Poseidon* 🔱` +
  (t.helios === t.poseidon ? "  (tied)" : `  (${t.helios > t.poseidon ? "Helios" : "Poseidon"} leads)`);

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply("Send this as a Slack slash command.");
  const raw = await req.text();
  if (!(await verifySlack(req, raw))) return new Response("bad signature", { status: 401 });

  const p = new URLSearchParams(raw);
  const text = (p.get("text") ?? "").trim();
  const user = p.get("user_name") ?? "";
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

  const parts = text.split(/\s+/).filter(Boolean);
  const first = (parts[0] ?? "").toLowerCase();

  if (!first || first === "help") {
    return reply(
      "*Tribe points* — award like this:\n" +
      "• `/point helios 3 won the relay`\n" +
      "• `/point poseidon 2 best cabin`\n" +
      "• `/point score` — show the current score\n" +
      "Tribes: helios / gold / sun  ·  poseidon / blue / sea. Negative numbers correct a mistake.",
    );
  }
  if (first === "score" || first === "scores") {
    return reply(scoreLine(await totals(sb)), true);
  }

  const tribe = TRIBES[first];
  if (!tribe) return reply(`Unknown tribe "${parts[0]}". Try *helios* or *poseidon* (or \`/point help\`).`);
  const pts = parseInt(parts[1] ?? "", 10);
  if (!pts) return reply("How many points? e.g. `/point helios 3 won the relay`.");
  const reason = parts.slice(2).join(" ").trim();

  const { error } = await sb.from("tribe_awards").insert({
    tribe, points: pts, reason, awarded_by: user ? `@${user} (Slack)` : "Slack",
  });
  if (error) return reply("Couldn't record that — try again in a moment.");

  const t = await totals(sb);
  return reply(
    `${pts > 0 ? "+" : ""}${pts} to ${NICE[tribe]}${reason ? ` — _${reason}_` : ""}` +
    `${user ? ` (by @${user})` : ""}\n${scoreLine(t)}`,
    true,
  );
});
