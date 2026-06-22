// Edge function: slack-week
// Hub-initiated Slack automation for the weekly staff channels.
//
//   action "create"  { week, name?, emails:[...] }
//       Creates a PRIVATE channel (hamptons-wkN), invites the matched staff
//       (looked up by email), posts an intro, and records it in slack_weeks.
//   action "digest"  { week }
//       Returns the bot's daily-summary posts in that week's channel, newest
//       first, for the hub's "Daily summary" view.
//   action "post-daily" { week, date? }
//       Posts the structured daily-update template into the week's channel
//       (intended to be called by a morning cron; also callable manually).
//
// Security:
// - Deployed with verify_jwt = true: Supabase validates the caller's Supabase
//   session JWT before this runs. We then require the caller to be a hub ADMIN
//   (checked against allowed_emails with the service role).
//
// SECRET: set SLACK_BOT_TOKEN (xoxb-...) in the Supabase dashboard
//   (Edge Functions -> slack-week -> Secrets). Kept out of version control.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SLACK_TOKEN = Deno.env.get("SLACK_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Decode the email claim from the (already-verified) Supabase JWT.
function emailFromJwt(authHeader: string): string {
  const tok = (authHeader || "").replace(/^Bearer\s+/i, "");
  const parts = tok.split(".");
  if (parts.length < 2) return "";
  try {
    const pad = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(pad + "=".repeat((4 - pad.length % 4) % 4)));
    return String(payload.email || "").toLowerCase();
  } catch (_e) {
    return "";
  }
}

async function slack(method: string, params: Record<string, unknown>) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${SLACK_TOKEN}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(params),
  });
  return await res.json();
}

const dailyTemplate = (dateLabel: string) =>
  `:sunny: *Daily update — ${dateLabel}*\n` +
  `> *Attendance:* \n` +
  `> *Highlights:* \n` +
  `> *Heads-ups / needs:* \n` +
  `> *Tomorrow:* `;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method" }, 405);

  if (!SLACK_TOKEN) return json({ ok: false, error: "Slack bot token not configured yet." }, 503);

  const email = emailFromJwt(req.headers.get("Authorization") || "");
  if (!email) return json({ ok: false, error: "Not signed in." }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: me } = await sb
    .from("allowed_emails").select("is_admin,is_owner").eq("email", email).maybeSingle();
  if (!me || !(me.is_admin || me.is_owner)) {
    return json({ ok: false, error: "Admins only." }, 403);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch (_e) { /* empty */ }
  const action = String(body.action || "");
  const week = Number(body.week || 0);
  if (!week) return json({ ok: false, error: "Missing week." }, 400);

  try {
    if (action === "create") {
      const emails: string[] = Array.isArray(body.emails)
        ? (body.emails as string[]).map((e) => String(e).toLowerCase().trim()).filter(Boolean)
        : [];
      const name = String(body.name || `hamptons-wk${week}`)
        .toLowerCase().replace(/[^a-z0-9-_]/g, "-").slice(0, 79);

      // Reuse the channel if we already made one for this week.
      let row = (await sb.from("slack_weeks").select("*").eq("week", week).maybeSingle()).data;
      let channelId = row?.channel_id as string | undefined;
      let channelName = row?.channel_name as string | undefined;

      if (!channelId) {
        const created = await slack("conversations.create", { name, is_private: true });
        if (!created.ok) return json({ ok: false, error: `Slack: ${created.error}` }, 400);
        channelId = created.channel.id;
        channelName = created.channel.name;
        await slack("chat.postMessage", {
          channel: channelId,
          text: `:anchor: *Welcome to Week ${week}!* This is the private channel for this week's staff. ` +
            `Daily summaries will be posted here each morning.`,
        });
      }

      // Invite staff matched by email.
      const invited: string[] = [];
      const failed: string[] = [];
      for (const e of emails) {
        const look = await slack("users.lookupByEmail", { email: e });
        if (look.ok && look.user?.id) {
          const inv = await slack("conversations.invite", { channel: channelId, users: look.user.id });
          if (inv.ok || inv.error === "already_in_channel") invited.push(e);
          else failed.push(`${e} (${inv.error})`);
        } else {
          failed.push(`${e} (no Slack account)`);
        }
      }

      await sb.from("slack_weeks").upsert({
        week, channel_id: channelId, channel_name: channelName,
        created_by: email, invited, updated_at: new Date().toISOString(),
      });

      const teamId = (await slack("auth.test", {})).team_id || "";
      const link = teamId ? `https://app.slack.com/client/${teamId}/${channelId}` : "";
      return json({ ok: true, channel_id: channelId, channel_name: channelName, invited, failed, link });
    }

    if (action === "post-daily") {
      const row = (await sb.from("slack_weeks").select("channel_id").eq("week", week).maybeSingle()).data;
      if (!row?.channel_id) return json({ ok: false, error: "No channel for this week yet." }, 400);
      const dateLabel = String(body.date || new Date().toLocaleDateString("en-US",
        { weekday: "long", month: "short", day: "numeric" }));
      const r = await slack("chat.postMessage", { channel: row.channel_id, text: dailyTemplate(dateLabel) });
      if (!r.ok) return json({ ok: false, error: `Slack: ${r.error}` }, 400);
      return json({ ok: true });
    }

    if (action === "digest") {
      const row = (await sb.from("slack_weeks").select("channel_id").eq("week", week).maybeSingle()).data;
      if (!row?.channel_id) return json({ ok: true, posts: [] });
      const hist = await slack("conversations.history", { channel: row.channel_id, limit: 50 });
      if (!hist.ok) return json({ ok: false, error: `Slack: ${hist.error}` }, 400);
      const posts = (hist.messages || [])
        .filter((m: Record<string, unknown>) =>
          typeof m.text === "string" && (m.text as string).includes("Daily update"))
        .map((m: Record<string, unknown>) => ({ ts: m.ts, text: m.text }));
      return json({ ok: true, posts });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});
