# Mebar Manager

**A board that gets angry when things sit still.**

Mebar Manager is an anti-stall project manager for research groups. It exists
to fight the three ways research labs quietly lose months: small blockers
nobody solves, projects that drift into standby, and engineers left idle by
both. It doesn't manage documents or samples — it detects stalls and escalates
them until someone fights back.

## How it fights

The home page is the **Fight List**: every red item in the lab, sorted by how
long it's been getting away with it. Each item carries a one-click action that
ends the fight. An empty Fight List is the goal state.

The rules (thresholds in `src/lib/thresholds.ts`):

| Rule | Trigger | Who it yells at |
|---|---|---|
| Stalled project | ACTIVE/BLOCKED, no update in **14 days** | owner |
| Past revive date | PAUSED beyond its revive date | advisor (revive or kill) |
| Overdue blocker | open blocker past its deadline | blocker owner |
| Unowned blocker | open blocker with no owner for **2 days** | advisor |
| Pending decision | every pending decision; **auto-proceeds at 48h** with the engineer's recommendation | advisor |
| Missed milestone | past due, not done, project still moving | owner |
| Overdue data request | open request past its needed-by date | analyst (else advisor) |
| Unowned data request | no analyst assigned for **2 days** | advisor |
| Pending compute request | every pending request; **never auto-proceeds**; red after 48h | compute coordinator |
| Compute results owed | approved request past its usage window without a results summary | requester |
| Missing PI / first author | active project without a named PI and first author | owner |
| Paperless project | active project **30 days** old with no paper on record | owner |
| Underloaded researcher | owner/advisor of fewer than **5** active projects | the researcher |

Other opinions built in:

- **Pausing requires a reason and a revive date.** Standby is a decision, not a drift.
- **Killing a project is a respectable outcome** — manager-only, with a reason, on the record.
- **Researchers file, coordinators activate.** A proposal can't enter an
  active state until leadership fires the transition AND the project names a
  **PI and a first author** on its People tab — either can be a lab member or
  an external person (students, outside PIs, assistants all live on the
  lineup, no account needed).
- **Every project must lead to a Q1 paper.** The Papers tab tracks the
  manuscript from draft through submission to acceptance (rejections
  resubmit, reasons on the record); submission and acceptance score
  performance points for the project owner.
- Proposals answer the **Heilmeier Catechism** (DARPA's eight questions).
- Resolved blockers are tagged by cause; the **Pareto chart** on the Fight List
  shows what systemically blocks the lab.
- Project lifecycle: `PROPOSAL → SCOPING → ACTIVE ⇄ BLOCKED → PAUSED → DONE/KILLED`,
  enforced by a state machine with full transition history.

## Roles

Four base roles — **Admin** (the PI), **Manager** (coordinator), **Engineer**
(researcher), and **Secretary** (lab staff) — plus add-ons granted on the
People page:

- **Admin**: exactly one person owns the dangerous stuff — creating and
  editing accounts, every settings tab, and the feedback triage. Managers
  cannot touch any of it (enforced at the auth API, not just the UI). The
  admin also holds full manager powers everywhere else.

- **Secretary**: receives **tasks** — anything with a deadline (orders,
  bookings, paperwork), filed by anyone from `/tasks`, optionally linked to a
  project. The same anti-stall rules apply: overdue tasks and unowned tasks
  join the Fight List. Secretaries see ONLY their own task list — no
  projects, board, or compute — while managers see everything of everyone.

**Leadership** (managers + the compute coordinator) additionally get:

- **Initiatives** (`/initiatives`): the weekly meeting's big fights —
  equipment, budgets, university management. Filed and assigned within
  leadership, with deadlines; overdue and unowned initiatives escalate on
  the Fight List; closed as WON or LOST with the story on the record.
- **Performance** (`/performance`): automatic scores for everyone —
  "we spare no one" — computed from the record over a rolling window:
  Delivery (things closed, on-time bonuses, compute verdicts, initiatives
  won), Discipline (weekly updates minus whatever is currently overdue on
  you or auto-proceeded past you), and Initiative-taking (fights started).
  Weights, window, and the anti-spam update cap are tunable in Settings →
  Performance; every person sees their own breakdown on `/account`.

Everyone gets the **feedback button** in the header (bug reports / feature
ideas, with your name attached); the admin triages them at `/admin/feedback`.

- **Data analyst** (add-on, any engineer): researchers file **data requests**
  on their projects; the assigned analyst (or a self-claiming one) is
  responsible for delivering. Data requests obey all anti-stall rules.
- **Compute coordinator** (exactly one manager): the only person who decides
  **compute requests**. A request must state the server type + hours, a
  justification with a utilization plan (sweeps, ablations, schedule,
  metrics), proof of preprocessing + exact dataset size, dry-run evidence,
  expected results, and an optimization-practices commitment (DDP/FSDP is
  mandatory for multi-GPU). Approval grants access (e.g. NVIDIA Brev) with an
  expiry window; after the window a results summary (outcomes vs. expected)
  is owed, and everything left on the server is not guaranteed to be
  retained. `/compute` shows the whole queue and history.

## Stack

Next.js (App Router) · Tailwind v4 + shadcn/ui (Base UI) · Drizzle ORM +
SQLite (better-sqlite3) · better-auth (email/password + admin plugin, no
self-signup) · zod · date-fns · recharts · vitest · Playwright (e2e).

## Quickstart

```bash
npm install
npm run db:migrate       # create ./data/mebar.db from the committed migrations
npm run db:seed          # creates the first ADMIN account and prints its password once
npm run dev
```

Set `MANAGER_EMAIL` / `MANAGER_PASSWORD` before seeding to choose the first
account's credentials; otherwise a random password is generated and printed.

Want a lab that already looks alive (every fight rule triggered)?

```bash
npm run db:seed -- --demo
# prof@lab.local / mebar-demo (ADMIN + compute coordinator)
# noa@lab.local / mebar-demo (manager, not coordinator)
# taylor@lab.local / mebar-demo (secretary)
# sara@ / omid@ / lena@ / dan@lab.local / mebar-demo (engineers)
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build && npm start` | production |
| `npm run db:migrate` | apply committed migrations (safe on live data; backs up first) |
| `npm run db:generate` | generate a new migration from schema.ts changes |
| `npm run db:push` | push schema directly — local iteration on a throwaway DB only |
| `npm run db:seed [-- --demo]` | seed admin (and optionally the demo lab) |
| `npm test` | unit tests (state machine + fight engine) |
| `npx tsx scripts/verify.e2e.ts` | browser click-through against a running dev server (`BASE_URL`, `CHROMIUM_PATH`, `SHOTS_DIR` to override) |

## Layout

```
src/lib/workflow.ts          # table-driven project lifecycle (admin-editable)
src/lib/fight-engine.ts      # pure stall-detection rules (the product)
src/lib/settings-schema.ts   # every admin-customizable knob, zod-validated
src/lib/settings-defaults.ts # stock workflow/taxonomies/rules (one source)
src/lib/thresholds.ts        # the default numbers
src/lib/fight-data.ts        # DB → engine snapshot
src/lib/maintenance.ts       # lazy decision auto-proceed
src/actions/                 # zod-validated server actions
src/app/(app)/               # / (Fight List), /board, /tasks, /data, /compute
scripts/seed.ts              # admin + relative-to-now demo lab
```

## Administration & customization

Everything is admin-editable at **/admin/settings** (the admin alone), across
seven tabs — removals are always *archive*, never delete, so history keeps
rendering:

- **General**: lab name, login tagline, default theme (light/dark — every
  user also has their own toggle), visibility mode.
- **Workflow**: the project lifecycle itself — add/rename/recolor/archive
  states, set their semantic flags (counts-for-stall, paused-like, terminal,
  resets-stall-clock, hidden-from-board), and edit the transitions between
  them (label, who may fire it, whether it asks for a reason). The stock
  PROPOSAL → SCOPING → ACTIVE ⇄ BLOCKED → PAUSED → DONE/KILLED pipeline is
  just the default; "Reset to stock workflow" brings it back.
- **Categories**: blocker cause tags (feeds the Pareto), compute server
  types (each with its own mandatory optimization practices — the stock
  Multi-GPU ⇒ DDP/FSDP rule is data, not code), and the optimization
  checklist itself.
- **Proposal form**: rename/archive the seven Heilmeier built-ins, add your
  own questions; answers to custom questions live with the project.
- **Fight rules**: all thresholds, plus per-rule on/off switches, section
  titles/blurbs, and the Fight List section order.
- **Performance**: the scoring window, the per-project-per-week update
  credit cap, and all 20 metric weights.
- **Permissions**: minimum role per action (people can always act on their
  own things; user management, settings, deciding decisions, and compute
  approval stay fixed).
- **Visibility**: RESTRICTED (default) — managers see everything, researchers
  see only projects they're involved in (owner, advisor, creator, blocker
  owner, data-request requester/assignee, compute requester, or listed on the
  project's People lineup). OPEN shows everything to everyone.
- **Accounts**: everyone has an /account page (change name/password, see
  their own fights). The admin resets passwords, renames, promotes/demotes
  from the People page. "Forgot password" emails a reset link when SMTP_* env vars
  are set (see `.env.example`); otherwise it points at the coordinator reset.
- **Watcher emails**: people on a project's People tab with the bell toggled
  on get a plain-text email on big events — state changes, milestones
  completed, paper status changes (never the daily chatter). Externals use
  the email on their row; members their account email. Needs the same SMTP_*
  vars; without them the toggle is stored but nothing sends.
- **No hard deletes**: everything closes with a status and a reason —
  blockers/milestones/decisions/data requests cancel, compute requests
  withdraw, projects are killed. History stays on the record.

Auth accounts are created by the admin at **People** — there is no self-signup.
Deactivating a person revokes their sessions. See `.env.example` for
production configuration (set `BETTER_AUTH_SECRET`).

## Deploy (VPS)

Everything you need ships in `Dockerfile` + `deploy/`. A ~$5/month VPS
(Hetzner CX22, DigitalOcean basic) runs a lab of any realistic size.

```bash
# On a fresh Ubuntu VPS with Docker installed and your domain's DNS A record
# pointed at it:
git clone <this repo> /opt/mebar-manager
cd /opt/mebar-manager/deploy
cp .env.production.example .env
nano .env                       # set DOMAIN and BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d --build    # app + Caddy (automatic HTTPS); schema migrates on start

# First boot only — create the first manager account:
MANAGER_EMAIL=you@lab.org MANAGER_PASSWORD=... docker compose exec -e MANAGER_EMAIL -e MANAGER_PASSWORD app npx tsx scripts/seed.ts

# Survive reboots + nightly backups:
sudo cp mebar.service /etc/systemd/system/ && sudo systemctl enable --now mebar
chmod +x backup.sh && crontab -e   # add: 15 3 * * * /opt/mebar-manager/deploy/backup.sh >> /var/log/mebar-backup.log 2>&1
```

- **Backups**: `deploy/backup.sh` takes an online SQLite backup (safe with
  WAL, zero downtime) into `/opt/mebar-backups`, rotating after 14 days. The
  restore drill is documented in the script header — practice it once.
- **Updates**: `git pull && docker compose up -d --build` — that's the whole
  procedure. Schema migrations apply automatically on container start, and an
  automatic pre-migrate backup lands next to the DB on the volume (newest 5
  kept). For big upgrades, run `deploy/backup.sh` manually first. If a
  migration fails the container exits with your data untouched — check
  `docker compose logs app`.
- **Without Docker**: `npm ci && npm run build && npm run db:migrate &&
  BETTER_AUTH_SECRET=... npm start` behind any reverse proxy; the app is a
  single Node process + one SQLite file.

### Schema changes (for developers)

The database is upgraded only by committed migrations in `drizzle/` — never
edit or reorder a migration that has shipped; add a new one
(`npm run db:generate` after editing `src/lib/db/schema.ts`). Databases
created before the migration system (via `db:push`) are adopted automatically:
the runner records the baseline as already applied and continues from there.
`db:push` remains for local iteration on a schema you haven't generated yet —
use it only on a database you're willing to delete.
