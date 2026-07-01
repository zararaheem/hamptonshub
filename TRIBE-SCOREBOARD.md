# Tribe Scoreboard — Helios vs Poseidon

A live points tracker built into the hub (**Tribe Scoreboard** tab) plus an
optional Slack slash command so anyone can award points from Slack.

## What's already live

- **Hub tab → Tribe Scoreboard.** Gold **Helios** vs blue **Poseidon**, big
  live scores, quick `+1 / +2 / +3 / +5` and custom award buttons, a reason
  field, and a recent-awards log. Admins can remove any entry.
- **Live for everyone.** Points are stored in Supabase (`tribe_awards`) with
  realtime — every open scoreboard updates the instant a point is awarded,
  whether from the hub or Slack.
- **Seeded:** Helios +3 (Launch games).

## Big-screen live board (for projecting)

A standalone, **no-login** full-screen scoreboard lives at **`/board/`**
(e.g. `https://hamptonshub.vercel.app/board/`). Open it on a TV/laptop and it
shows Helios vs Poseidon in huge numbers, highlights the leader, runs a ticker
of recent awards, and refreshes every 5 seconds. There's an **“📺 Open live
board ↗”** button on the hub's Tribe Scoreboard tab. It reads through the public
`tribe-board` edge function (only the two scores + award reasons are exposed).

No extra Vercel setup — `board/index.html` deploys as a subpath of the existing
hub project.

## Award from Slack — interactive buttons (private channel)

Private channel **`#tribe_points_week1`** is already created. People are given
**buttons only** — no free typing: **+1 / +3** (award) and **−1 / −3** (deduct)
per tribe, **Other…** (custom amount + reason), and **Receipts** (recent log).
Each tap posts a receipt to the channel and updates the hub + big board live.

The `tribe-interact` edge function is deployed. One-time Slack app setup:

1. **Create a Slack app** at <https://api.slack.com/apps> → *Create New App* →
   *From scratch* → pick your workspace.
2. **Bot token scopes:** *OAuth & Permissions* → Bot Token Scopes → add
   `chat:write` and `commands`. Then *Install to Workspace* and copy the
   **Bot User OAuth Token** (`xoxb-…`).
3. **Slash command:** *Slash Commands* → *Create New Command*
   - **Command:** `/points`
   - **Request URL:** `https://qwmetffzspobjamwwhca.supabase.co/functions/v1/tribe-interact`
   - **Short description:** `Open the tribe points panel`
4. **Interactivity:** *Interactivity & Shortcuts* → toggle on →
   **Request URL:** `https://qwmetffzspobjamwwhca.supabase.co/functions/v1/tribe-interact`
5. **Signing Secret:** *Basic Information* → copy **Signing Secret**.
6. **Add secrets in Supabase** → *Project Settings → Edge Functions → Secrets*:
   - `SLACK_SIGNING_SECRET` = the signing secret (required — locks down the endpoint)
   - `SLACK_BOT_TOKEN` = the `xoxb-…` token (enables the **Other…** custom modal)
7. **Invite the app** to `#tribe_points_week1` (`/invite @YourApp`), then type
   **`/points`** in the channel to drop the buttons panel. Pin it.

Once live: tapping a button awards/deducts and posts a receipt; **Other…** opens
a little form (tribe + amount + optional reason); **Receipts** shows the last 15.
Everything flows into the same `tribe_awards` table, so the hub tab and the
projected board stay in sync.

> A simpler typed **`/point`** slash command (`tribe-award` function) is also
> deployed if you ever want free-text awarding instead of buttons.
