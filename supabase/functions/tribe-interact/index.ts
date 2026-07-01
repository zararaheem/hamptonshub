// Edge function: tribe-interact
// Interactive Slack panel for the Tribe Scoreboard in #tribe_points_week1.
// People are given BUTTONS only (no free typing): award +1/+3, deduct -1/-3,
// "Other" (custom amount + reason via a modal), and "Receipts" (recent log).
// Every tap writes to public.tribe_awards, so the hub + big board update live.
//
// verify_jwt = FALSE. Requests are verified with SLACK_SIGNING_SECRET.
// Core buttons (+/-, receipts) need only the signing secret. The "Other" modal
// additionally needs SLACK_BOT_TOKEN (Slack requires a bot token to open modals).
//
// Slack app setup — see TRIBE-SCOREBOARD.md.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SIGNING_SECRET = Deno.env.get("SLACK_SIGNING_SECRET") ?? "";
const BOT_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") ?? "";

const NAME: Record<string, string> = { helios: "Helios", poseidon: "Poseidon" };
const EMO: Record<string, string> = { helios: "☀️", poseidon: "🔱" };

async function verifySlack(req: Request, raw: string): Promise<boolean> {
  if (!SIGNING_SECRET) return true;
  const ts = req.headers.get("x-slack-request-timestamp") ?? "";
  const sig = req.headers.get("x-slack-signature") ?? "";
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`v0:${ts}:${raw}`));
  const mine = "v0=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (mine.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < mine.length; i++) diff |= mine.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

const sb = () => createClient(SUPABASE_URL, SERVICE_ROLE);
async function totals(db: ReturnType<typeof createClient>) {
  const { data } = await db.from("tribe_awards").select("tribe, points");
  const t = { helios: 0, poseidon: 0 };
  (data ?? []).forEach((r: { tribe: string; points: number }) => {
    if (r.tribe in t) (t as Record<string, number>)[r.tribe] += Number(r.points) || 0;
  });
  return t;
}
function leadTxt(t: { helios: number; poseidon: number }) {
  if (t.helios === t.poseidon) return "· tied";
  return `· ${t.helios > t.poseidon ? "Helios" : "Poseidon"} leads`;
}
const B = (text: string, action_id: string, style?: string) => {
  const b: Record<string, unknown> = { type: "button", text: { type: "plain_text", text, emoji: true }, action_id, value: action_id };
  if (style) b.style = style;
  return b;
};
function panel(t: { helios: number; poseidon: number }) {
  return [
    { type: "header", text: { type: "plain_text", text: "🏕️ Tribe Points · Week 1", emoji: true } },
    { type: "section", text: { type: "mrkdwn", text: `*☀️ Helios ${t.helios}*    vs    *${t.poseidon} Poseidon 🔱*   ${leadTxt(t)}` } },
    { type: "actions", elements: [B("☀️ Helios +1", "helios:1"), B("+3", "helios:3"), B("−1", "helios:-1", "danger"), B("−3", "helios:-3", "danger")] },
    { type: "actions", elements: [B("🔱 Poseidon +1", "poseidon:1"), B("+3", "poseidon:3"), B("−1", "poseidon:-1", "danger"), B("−3", "poseidon:-3", "danger")] },
    { type: "actions", elements: [B("✏️ Other…", "other", "primary"), B("🧾 Receipts", "receipts")] },
    { type: "context", elements: [{ type: "mrkdwn", text: "Tap to award or deduct — each tap posts a receipt and updates the live board." }] },
  ];
}
async function respond(url: string, body: unknown) {
  await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function slackApi(method: string, body: unknown) {
  return fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${BOT_TOKEN}` },
    body: JSON.stringify(body),
  }).then((r) => r.json());
}
const jsonResp = (b: unknown) => new Response(JSON.stringify(b), { headers: { "Content-Type": "application/json" } });
async function insertAward(db: ReturnType<typeof createClient>, tribe: string, pts: number, reason: string, user: string) {
  await db.from("tribe_awards").insert({ tribe, points: pts, reason, awarded_by: user ? `@${user} (Slack)` : "Slack" });
}
function receiptText(tribe: string, pts: number, reason: string, userId: string) {
  return `${EMO[tribe]} *${NAME[tribe]} ${pts > 0 ? "+" : ""}${pts}*${reason ? ` — ${reason}` : ""}  ·  by <@${userId}>`;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  if (!(await verifySlack(req, raw))) return new Response("bad signature", { status: 401 });
  const params = new URLSearchParams(raw);
  const db = sb();

  // 1) Slash command "/points" → post the interactive panel into the channel.
  if (params.has("command")) {
    return jsonResp({ response_type: "in_channel", blocks: panel(await totals(db)) });
  }

  // 2) Interactivity (button clicks + modal submit) arrive as payload=<json>.
  const payloadStr = params.get("payload");
  if (!payloadStr) return new Response("");
  const p = JSON.parse(payloadStr);

  // 2a) Modal submission from "Other".
  if (p.type === "view_submission" && p.view?.callback_id === "other_submit") {
    const v = p.view.state.values;
    const tribe = v.tribe?.v?.selected_option?.value;
    const pts = parseInt(v.pts?.v?.value ?? "", 10);
    const reason = (v.reason?.v?.value ?? "").trim();
    if (!tribe || !pts) return jsonResp({ response_action: "clear" });
    const user = p.user?.username ?? p.user?.name ?? "";
    await insertAward(db, tribe, pts, reason, user);
    const t = await totals(db);
    try {
      const meta = JSON.parse(p.view.private_metadata || "{}");
      if (BOT_TOKEN && meta.channel && meta.ts) {
        await slackApi("chat.update", { channel: meta.channel, ts: meta.ts, blocks: panel(t) });
        await slackApi("chat.postMessage", { channel: meta.channel, text: receiptText(tribe, pts, reason, p.user.id) });
      }
    } catch (_e) { /* ignore */ }
    return jsonResp({ response_action: "clear" });
  }

  // 2b) Button clicks.
  if (p.type === "block_actions") {
    const action = p.actions?.[0] ?? {};
    const id = action.action_id as string;
    const responseUrl = p.response_url as string;
    const user = p.user?.username ?? p.user?.name ?? "";

    if (id === "receipts") {
      const { data } = await db.from("tribe_awards").select("tribe, points, reason, awarded_by, created_at").order("created_at", { ascending: false }).limit(15);
      const lines = (data ?? []).map((r: { tribe: string; points: number; reason: string; awarded_by: string }) =>
        `${EMO[r.tribe] ?? ""} ${NAME[r.tribe] ?? r.tribe} *${r.points > 0 ? "+" : ""}${r.points}*${r.reason ? ` — ${r.reason}` : ""}  ·  ${(r.awarded_by || "").replace(" (Slack)", "")}`);
      await respond(responseUrl, { response_type: "ephemeral", replace_original: false, text: `🧾 *Recent receipts*\n${lines.join("\n") || "None yet."}` });
      return new Response("");
    }

    if (id === "other") {
      if (!BOT_TOKEN) {
        await respond(responseUrl, { response_type: "ephemeral", replace_original: false, text: "Custom amounts need a bot token set up (SLACK_BOT_TOKEN). For now use the +1 / +3 / −1 / −3 buttons, or the hub." });
        return new Response("");
      }
      const meta = JSON.stringify({ channel: p.channel?.id, ts: p.message?.ts });
      await slackApi("views.open", {
        trigger_id: p.trigger_id,
        view: {
          type: "modal", callback_id: "other_submit", private_metadata: meta,
          title: { type: "plain_text", text: "Award / deduct" }, submit: { type: "plain_text", text: "Apply" }, close: { type: "plain_text", text: "Cancel" },
          blocks: [
            { type: "input", block_id: "tribe", label: { type: "plain_text", text: "Tribe" }, element: { type: "radio_buttons", action_id: "v", options: [
              { text: { type: "plain_text", text: "☀️ Helios", emoji: true }, value: "helios" },
              { text: { type: "plain_text", text: "🔱 Poseidon", emoji: true }, value: "poseidon" }] } },
            { type: "input", block_id: "pts", label: { type: "plain_text", text: "Points (use a negative number to deduct)" }, element: { type: "number_input", is_decimal_allowed: false, action_id: "v" } },
            { type: "input", block_id: "reason", optional: true, label: { type: "plain_text", text: "Reason (optional)" }, element: { type: "plain_text_input", action_id: "v" } },
          ],
        },
      });
      return new Response("");
    }

    // award/deduct: action_id is "tribe:delta"
    const [tribe, deltaStr] = id.split(":");
    const delta = parseInt(deltaStr, 10);
    if (NAME[tribe] && delta) {
      await insertAward(db, tribe, delta, "", user);
      const t = await totals(db);
      await respond(responseUrl, { replace_original: true, blocks: panel(t) });
      await respond(responseUrl, { response_type: "in_channel", replace_original: false, text: receiptText(tribe, delta, "", p.user.id) });
    }
    return new Response("");
  }

  return new Response("");
});
