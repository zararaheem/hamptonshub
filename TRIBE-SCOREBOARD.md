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

## Award from Slack (one-time setup, ~5 min)

The `tribe-award` edge function is deployed. To connect Slack:

1. **Create the channel** in Slack: `#tribe-games` (new channel → invite the team).
2. **Create a Slack app** at <https://api.slack.com/apps> → *Create New App* →
   *From scratch* → pick your workspace.
3. **Add a slash command:** app → *Slash Commands* → *Create New Command*
   - **Command:** `/point`
   - **Request URL:** `https://qwmetffzspobjamwwhca.supabase.co/functions/v1/tribe-award`
   - **Short description:** `Award tribe points`
   - **Usage hint:** `helios 3 won the relay`
4. **Copy the Signing Secret:** app → *Basic Information* → *Signing Secret*.
5. **Add it to Supabase:** Supabase dashboard → *Project Settings → Edge
   Functions → Secrets* → add `SLACK_SIGNING_SECRET` = that value.
   (Until this is set the endpoint accepts unsigned requests, so set it to lock down.)
6. **Install** the app to the workspace and **invite it to `#tribe-games`**.

### Using it

```
/point helios 3 won the relay
/point poseidon 2 best cabin cleanup
/point score            → shows the current score in-channel
/point help             → usage
```

Tribe aliases: `helios / gold / sun` and `poseidon / blue / sea`. A negative
number (e.g. `/point helios -1 penalty`) corrects a mistake. Every award posts
the running score back to the channel **and** updates the hub scoreboard live.
