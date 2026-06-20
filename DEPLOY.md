# Hamptons Hub — Deploy & Access Guide

The whole hub is a single file: **`index.html`**. No build step, no dependencies. You can open it locally, or host it anywhere static. Below is the path to get it live at something like **hamptonshub.vercel.app**, plus how to turn the preview login into real, secure access.

---

## 1. Put it on GitHub

> **Important:** don't push this into `zararaheem/summer-nyc`. That repo powers **summer-nyc.vercel.app**, which the hub *embeds* in the Supplies & Packing tab — overwriting it would break that site. Use a **new repo** so both can live side by side.

```bash
# in an empty folder containing index.html (and this DEPLOY.md)
git init
git add index.html DEPLOY.md
git commit -m "Hamptons Hub v1"
git branch -M main
git remote add origin https://github.com/zararaheem/hamptons-hub.git   # create this repo first on github.com
git push -u origin main
```

(Or simply upload `index.html` through the GitHub web UI — "Add file → Upload files".)

## 2. Deploy on Vercel

1. Go to **vercel.com → Add New → Project**, and import the `hamptons-hub` repo.
2. Framework preset: **Other**. Root directory: `/`. No build command, no output dir — Vercel serves `index.html` as-is.
3. Deploy. You'll get a `…vercel.app` URL.
4. To make it **hamptonshub.vercel.app**: Project → **Settings → General → Project Name** → rename to `hamptonshub` (the subdomain follows the project name). If it's taken, pick another (e.g. `alpha-hamptons-hub`) or add a custom domain under **Settings → Domains**.

Every `git push` to `main` auto-redeploys.

---

## 3. Preview mode (the `local` fallback)

> The hub now ships in **`supabase` mode** (step 4) — real sign-in is on. This section describes the **`local`** fallback you get by setting `CONFIG.mode = 'local'`, useful for offline demos.

In `local` mode the hub gates entry to **@alpha.school / @trilogy.com** emails and an **allow-list you manage** (Access tab — visible only to you as owner, `zara.raheem@alpha.school`).

This check runs in the browser, so treat it as a **soft gate, not real security**. The allow-list is stored per-browser, and student health data stays on the device that entered it.

> ⚠️ **In `local` mode, don't put real student data (names, allergies, medications) on a public URL** — keep it in your own browser only. For shared, protected data, use `supabase` mode (step 4, already wired).

---

## 4. Real sign-in + shared access (Supabase) — ✅ wired

The hub now ships in **`supabase` mode** (see the `CONFIG` block at the top of `index.html`). The browser gate is replaced by **magic-link login** plus a **shared, server-side allow-list** and **student health protected by row-level security (RLS)**.

**What's already done** (Supabase project `supabase-rose-school`):

- `CONFIG` block wired with the Project URL + anon public key (safe to ship).
- Two tables created, both with RLS:
  - `allowed_emails` — the list you curate (`email`, `is_admin`, `is_owner`).
  - `student_health` — allergies/meds, keyed by week + roster index.
- RLS policies (verified): a signed-in user sees data **only if their email is in `allowed_emails`**. A signed-in stranger sees **zero rows**. Admins/owner manage the list; the owner row is protected from deletion.
- You're seeded as **owner + admin** (`zara.raheem@alpha.school`).

**Two manual steps only you can do** (both in the Supabase dashboard, ~2 min):

1. **Auth → URL Configuration:** set **Site URL** to your live URL (e.g. `https://hamptonshub.vercel.app`) and add it under **Redirect URLs** (plus `http://localhost:3000` / wherever you open it locally). Magic-link sign-in won't redirect back until this matches your domain.
2. **Auth → Providers → Email:** confirm **Email** is enabled (magic link works by default). Optional: turn on a custom SMTP sender if you expect more than a handful of logins per hour — Supabase's built-in email is rate-limited.

> **Note on domain restriction:** entry to data is enforced by RLS membership in `allowed_emails` (the real security layer). The page also checks `@alpha.school` / `@trilogy.com` client-side. Supabase doesn't restrict *who can request a magic link* by domain out of the box — but anyone not on the allow-list who signs in sees nothing. To add Google "Sign in with Google" later, create a Google OAuth client and add it under Auth → Providers.

To go back to the browser-only preview at any time, set `CONFIG.mode` to `'local'` in `index.html`.

---

## 5. Adding later weeks

Attendance, Tech Onboarding, and Weekly Supplies are seeded with the **Week 1** roster. When you have rosters for weeks 2–9 (first name, last name, grade, email), send them over and they'll slot into the same screens with the level breakdown and health flags intact.
