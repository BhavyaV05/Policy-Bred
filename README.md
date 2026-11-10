# BRED study — Framing, Social Conformity & Policy Support

A working research data-collection app for the 2×2 between-subjects experiment (framing × perceived majority opinion, five policies, pre/post design).
Participants use a calm step-by-step questionnaire; you get a password-protected dashboard with live allocation counts, descriptive charts and CSV exports.

> **Ethics.** This software does not make the study ethics-approved or compliant with any institutional policy. The consent/information wording is subject to your ethics approval — obtain it before sharing the participant link.

## What's in the box

| Area | Implementation |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind CSS (static site) |
| Backend / DB | Supabase (PostgreSQL). **All study logic is in Postgres functions** called through the public anon key |
| Admin | Supabase Auth (email + password) + an `admin_users` allow-list; dashboard at `#/admin` |
| Hosting | **GitHub Pages** (`https://<your-username>.github.io/<repo>/`), built and published by a GitHub Actions workflow |

### Why Supabase is still needed
GitHub Pages can only serve static files: it cannot store responses, run the balanced random assignment, or protect an admin area. Supabase (free tier) is therefore the data store; the website itself lives on GitHub Pages. The site uses hash URLs because Pages cannot rewrite paths: participants open `https://<user>.github.io/<repo>/`, you open `https://<user>.github.io/<repo>/#/admin`.

### Why this architecture
Participants have **no table access at all**. The browser only calls whitelisted `SECURITY DEFINER` functions (`start_session`, `submit_consent`, `save_policy_response`, `assign_condition`, …) which authenticate with a secret resume token (only its SHA-256 hash is stored), validate every input server-side, enforce the step order, and never return the assigned condition label. Randomisation runs inside Postgres under an advisory lock, so simultaneous submissions cannot over-fill a group. The service-role key is never used and never appears in the front end.

## Project structure

```
experiment/
├─ supabase/
│  ├─ migrations/            # 5 SQL files: schema, content seed, functions, export views, security (RLS/grants)
│  ├─ setup_all.sql          # the 5 migrations concatenated (paste into Supabase SQL editor)
│  └─ create_admin.sql       # grant dashboard access to your account
├─ src/
│  ├─ participant/           # participant flow (ParticipantApp + steps/*)
│  ├─ admin/                 # dashboard, charts, CSV export
│  ├─ content/               # questionnaire definitions, data dictionary, fixed game layout
│  ├─ components/ui.tsx      # buttons, scales, cards
│  └─ lib/                   # api (RPC wrappers + retry), session, supabase client
├─ scripts/                  # generate-game-layout.mjs, build-docs.mjs
├─ tests/
│  ├─ db.test.mjs            # 72 checks on the real SQL (PGlite)
│  └─ e2e/                   # 35 real-browser checks (Playwright) against the real SQL
├─ docs/DATA_DICTIONARY.md
├─ .github/workflows/deploy.yml   # builds and publishes to GitHub Pages on every push to main
├─ .env.example   README.md
```

## 1. Create the database (Supabase) — ~10 minutes

1. Create a free project at <https://supabase.com> (choose a region close to your participants; save the database password).
2. **SQL Editor → New query**, paste the whole of [`supabase/setup_all.sql`](supabase/setup_all.sql) and **Run**. (Equivalent to running the five files in `supabase/migrations/` in order.)
3. **Authentication → Providers → Email**: turn **off** "Allow new users to sign up" (only you should have an account).
4. **Authentication → Users → Add user → Create new user**: your email + a strong password, tick **Auto Confirm User**.
5. Open [`supabase/create_admin.sql`](supabase/create_admin.sql), put your email in, and run it. This is what lets that account see data.
6. **Project Settings → API**: copy the **Project URL** and the **anon public** key (never the `service_role` key).

## 2. Run locally

```bash
cd experiment
npm install
cp .env.example .env.local        # Windows: copy .env.example .env.local
# edit .env.local: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, researcher / supervisor details
npm run dev                        # participants: http://localhost:5173/   admin: http://localhost:5173/#/admin
```

Fill in `VITE_RESEARCHER_NAME`, `VITE_SUPERVISOR_NAME` (and optionally `VITE_RESEARCH_CONTACT_EMAIL`, `VITE_ESTIMATED_MINUTES`) — they appear on the Participant Information Sheet. **Update the time estimate after you pilot the site.**

## 3. Deploy for the week (GitHub Pages)

**Decide first: public or private repository.** GitHub Pages on a free personal account needs a **public** repo, so anyone can read your code, `supabase/*.sql` (which contains the framing and majority wording) and this README (which describes the hypothesis). Participants who find the repo could learn the design before the debrief. Two ways to avoid that:
* use a **private** repo with Pages (needs GitHub Pro/Team — students can get Pro free via the GitHub Student Developer Pack), or
* in a public repo, publish **only the website code** and keep `supabase/`, `docs/`, `tests/` and `README.md` on your own machine (they are not needed to build the site), and give the repo a neutral name such as `campus-opinions`.

Steps:
1. Create the GitHub repository and push this folder to the `main` branch (`.gitignore` already excludes `.env*`, `node_modules` and `dist`):
   ```bash
   git init && git add . && git commit -m "Study site"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo>.git
   git push -u origin main
   ```
2. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Repo → **Settings → Secrets and variables → Actions → Variables tab → New repository variable**. Add (values from `.env.example`):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_RESEARCHER_NAME`, `VITE_SUPERVISOR_NAME`, and optionally `VITE_RESEARCH_CONTACT_EMAIL`, `VITE_ESTIMATED_MINUTES`.
   These are public by design (they end up in the website). Use only the anon key — **never** the `service_role` key.
4. Repo → **Actions** → the "Deploy to GitHub Pages" run starts automatically after the push (or run it manually with *Run workflow*). When it is green, your link is shown at the end of the run and under Settings → Pages:
   * **Participant link:** `https://<your-username>.github.io/<repo>/`
   * **Admin dashboard:** `https://<your-username>.github.io/<repo>/#/admin`
5. Changed a variable or any code? Push again (or re-run the workflow); the site redeploys in about a minute.
6. Optional: if you already have a `<your-username>.github.io` repo, the same steps work and the link becomes `https://<your-username>.github.io/`.

### Ending the study after a week
1. Dashboard → **Export data**: download all CSVs (and keep the data dictionary).
2. Take the site down: Repo → **Settings → Pages → Unpublish site** (or delete/privatise the repo).
3. Supabase: keep the project (free projects pause after 7 days of inactivity; export first) or Settings → **Delete project** once your data are stored under your institution's data-management rules.

## 4. Test every condition *before* sending the link

1. Sign in at the admin link (`…/#/admin`) → **Test the conditions**.
2. Click **Open as Group 1 / 2 / 3 / 4**. Each opens a fresh participant session (new tab) where the server assigns *that* condition. Complete the study and confirm on the manipulation pages:
   * Group 1 — positive framing paragraph + "a majority of university students **support**…" on all five policies
   * Group 2 — positive framing + "…**oppose**…"
   * Group 3 — negative framing + "…support…"
   * Group 4 — negative framing + "…oppose…"
3. Also try: declining consent / "no" to 18+ (study ends); refresh mid-way (same page, same condition); the "Withdraw from the study" link; the **Save my resume code** link and resuming from a private window using the code.
4. Check **Participants** / **Export data** reflect those runs. Forced runs are flagged `is_test`, never count towards group quotas and are excluded from exports by default.
5. **Test the conditions → Delete test sessions** to wipe them before launch. (The forcing only works while *you* are signed in to the dashboard in that browser; for participants the server always allocates randomly.)

## 5. Random assignment

* Target: Group 1 = 13, Group 2 = 13, Group 3 = 12, Group 4 = 12 (editable: `update conditions set target_n = … where experimental_condition = …`).
* After the distraction task the browser calls `assign_condition`. In Postgres, under an advisory lock, the participant is drawn at random **weighted by each condition's remaining slots**. This is random for every participant but lands exactly on the targets (verified: 50 simulated participants → 13/13/12/12). Once all slots are filled, further participants are spread proportionally to the targets.
* Assignment is idempotent: refreshing, going back, or calling it again can never change a condition. The condition labels are never sent to the browser.
* A participant who started but abandoned for more than `stale_assignment_hours` (default 4; `study_config` table) stops using up a quota slot, so dropouts don't leave a group short. If they later return they keep their original condition.

## 6. Data and exports

Dashboard → **Export data** (completed, non-test participants by default; tick boxes to include incomplete/test sessions — `is_complete` and `is_test` columns always mark them):

| File | Contents |
|---|---|
| `all_responses` | every stored answer as tidy rows (participant, section, policy, item, response) |
| `participants` | one row per participant: consent, demographics, condition, game, supplementary + manipulation-check variables |
| `policy_long` | **one row per participant × policy**: `pre_support`, `post_support`, **`change_in_support`**, `framing_condition`, `majority_condition`, `experimental_group`, `policy_order`, `position_in_order` … |
| `participants_wide` | SPSS/Excel-ready: `p1_pre_support … p5_change` and `mean_change_all_policies` |
| `allocation` | targets vs assigned/completed per group |
| `distraction_task` | counting-task answers (descriptive only) |
| `data_dictionary` | every variable and its coding (also [`docs/DATA_DICTIONARY.md`](docs/DATA_DICTIONARY.md)) |

Analysis notes: `change_in_support = post − pre`. Framing (`framing_positive`) and majority (`majority_support`) are 1/0-coded, and `experimental_group` identifies the cell, so you can test the two main effects and their interaction. Each participant provides **five repeated observations — use participant as a random effect (or analyse `mean_change_all_policies`) rather than treating 250 rows as independent**. Nothing is excluded automatically; `majority_recall_correct` is provided so you can run sensitivity analyses.

The dashboard's Analysis tab is **descriptive only** (means and charts); it reports no significance tests or causal claims.

## 7. Safeguards implemented

No direct identifiers collected · RLS on every table, no participant table access · researcher-only dashboard (Supabase Auth + allow-list) · server-side validation of every field and of step order · server-side randomisation with locking · conditions immutable after assignment; pre-test answers locked once all five are saved (before the distraction task); post-test answers write-once · unique constraints (one pre and one post rating per participant per policy) · idempotent RPCs so network retries cannot duplicate or silently drop answers (the client retries with back-off) · progress survives refresh (resume token in the browser, and a copyable anonymous code for other devices) · no hypothesis shown before debriefing; no invented percentages; debrief states the majority statements were hypothetical · exact framing/majority wording + content version + policy order stored per participant · incomplete / declined / under-18 / withdrawn statuses retained and labelled · withdrawal before submission deletes the participant's data.

## 8. Decisions I made where the brief was silent (please confirm)

* **Required vs optional**: required = consent, age, year, degree, mess use, tutorial attendance, the five main support ratings (pre and post), the three post-test supplementary questions and the five manipulation checks. Everything else (gender, other background, confidence, familiarity, comments) is optional. Say if you want the supplementary / check questions made optional.
* **Scale end labels not in the brief**: tutorial usefulness (1 = Not at all useful … 7 = Extremely useful) and food-availability satisfaction (1 = Very dissatisfied … 7 = Very satisfied).
* **Crowding question** is hidden when the participant says they never use the mess.
* **Distraction task**: 38 shapes (12 circles, 11 triangles, 10 squares, 5 stars as distractors), same arrangement for everyone. A wrong count gets a neutral "please take another look" and up to 3 attempts, after which the participant continues regardless. It is stored but never used for assignment or as an outcome.
* **Age**: 18+ is required; there is no upper age limit (your target 18–22 is not enforced).
* **Manipulation page** shows the neutral policy text, then the framing paragraph, then the hypothetical majority statement (each visually separated; no labels revealing the condition).
* **Resume**: the token lives in the browser's local storage; participants can also copy it from "Save my resume code".

## 9. Known limitations

* Anyone with the link can open it; there is no login for participants (by design, to keep data anonymous). A determined person could participate more than once by clearing browser data. Share the link only through channels you control.
* The site is static, so security rests on Supabase: the admin dashboard is protected by Supabase sign-in, not by the (guessable) `#/admin` address, and GitHub Pages cannot set security headers (the site uses `noindex` and no-referrer meta tags instead).
* The free Supabase tier has rate limits and pauses idle projects; spamming `start_session` could create junk rows (filter by status; for protection add Cloudflare/Turnstile or Supabase rate limits if you publish the link widely).
* Pre-test sensitisation is acknowledged as a limitation of the design, as in your brief.

## 10. Tests

```bash
npm run test:db     # SQL logic in an in-memory Postgres: all four groups, 13/13/12/12 allocation, permissions, exports
npm run test:e2e    # real Chromium: desktop + 375px phone journeys, refresh/resume, consent branching, admin dashboard, CSV
```
