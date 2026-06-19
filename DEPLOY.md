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

## 3. Access today (preview mode)

Out of the box the hub gates entry to **@alpha.school / @trilogy.com** emails and an **allow-list you manage** (Access tab — visible only to you as owner, `zara.raheem@alpha.school`).

This check runs in the browser, so treat it as a **soft gate, not real security**. The allow-list is stored per-browser, and student health data stays on the device that entered it.

> ⚠️ **Before any real student data (names, allergies, medications) goes on a public URL, do step 4.** Until then, keep that data in your own browser only.

---

## 4. Real sign-in + shared access (Supabase)

You already have Supabase connected. This swaps the browser gate for proper magic-link login and a shared, server-side allow-list with student data protected by row-level security.

What it takes:

1. **A Supabase project** (free tier is fine) — its **Project URL** and **anon public key** (safe to ship in the page).
2. **Email (magic link) auth** enabled, with sign-ups restricted to your two domains.
3. Two tables: `allowed_emails` (the list you curate) and `student_health` (allergies/meds), both behind RLS so only signed-in, approved staff can read them.
4. Drop the URL + anon key into a small `CONFIG` block at the top of the hub and switch it from "local" to "supabase" mode.

I can drive most of this for you through the Supabase connector — creating the tables, seeding you as owner/admin, and wiring the page. The two things only you can do are confirming the Supabase project/plan and (if you want Google "Sign in with Google" instead of magic links) creating the Google OAuth client. Say the word and I'll set up the backend.

---

## 5. Adding later weeks

Attendance, Tech Onboarding, and Weekly Supplies are seeded with the **Week 1** roster. When you have rosters for weeks 2–9 (first name, last name, grade, email), send them over and they'll slot into the same screens with the level breakdown and health flags intact.
