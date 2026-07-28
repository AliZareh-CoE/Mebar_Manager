# Mebar Manager

**A board that gets angry when things sit still.**

Mebar Manager is an anti-stall project manager for research groups. It exists
to fight the three ways research labs quietly lose months: small blockers
nobody solves, projects that drift into standby, and researchers left idle by
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
| Pending decision | every pending decision; **auto-proceeds at 48h** with the researcher's recommendation | advisor |
| Missed milestone | past due, not done, project still moving | owner |
| Overdue data request | open request past its needed-by date | analyst (else advisor) |
| Unowned data request | no analyst assigned for **2 days** | advisor |
| Pending compute request | every pending request; **never auto-proceeds**; red after 48h | compute coordinator |
| Compute results owed | approved request past its usage window without a results summary | requester |
| Missing PI / first author | active project without a named PI and first author | owner |
| Underloaded researcher | owner/advisor of fewer than **5** running projects (blocked, stalled, paused, or unstarted ones don't count; analysts, secretaries, and leadership are exempt) | the researcher |
| Submission target at risk | drafting paper within **14 days** of its target submission date (red once past it) | owner |
| Overdue thesis milestone | planned person milestone (qualifier, defense, …) past its due date | the person |

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
- **The scoring can't be gamed.** Once a project is activated its PI and
  first author are locked; milestone due dates, task deadlines, and
  data-request dates are immutable once set; and a paper acceptance (the
  biggest prize) is confirmed by a coordinator, never by the person earning
  the points. Managers and the admin can still correct any of it —
  deliberately, on the record.
- Proposals answer the **Heilmeier Catechism** (DARPA's eight questions).
- Resolved blockers are tagged by cause; the **Pareto chart** on the Fight List
  shows what systemically blocks the lab.
- Project lifecycle: `PROPOSAL → SCOPING → ACTIVE ⇄ BLOCKED → PAUSED → DONE/KILLED`,
  enforced by a state machine with full transition history.

## What's new in v7

- **Off-site backups** — the nightly dump optionally pushes to a second
  location (rclone / rsync / scp, auto-detected), plus a scripted restore
  drill (`deploy/restore.sh`).
- **Paper venue targets** — papers carry a target submission date and a
  three-venue journal shortlist; a drafting paper inside the lead window
  raises a *Submission target at risk* fight, and Resubmit pre-fills the next
  shortlist venue.
- **Weekly digest email** — a personal Monday email per member (their fights,
  what's due this week, project freshness), with an admin kill switch and a
  per-person opt-out.
- **Meeting mode** (`/meeting`) — the lab meeting agenda auto-built from the
  record: fights for review, this week's updates, decisions to make, papers
  that moved, open initiatives. Print-friendly.
- **Protocol library** (`/sops`) — the lab's how-to SOPs with copyable
  step checklists.
- **Lab handbook + onboarding** (`/handbook`, `/welcome`) — admin-edited
  handbook sections every role can read, and a first-login welcome checklist
  that stamps each member as onboarded.
- **Thesis milestones** — per-person qualifier/defense/submission dates,
  managed by leadership, with an *Overdue thesis milestone* fight.
- **Admin audit log** (`/admin/audit`) — every privileged change on the
  record, newest first, filterable.

## What's new in v9

- **UTF students** — a name-only roster (no accounts) managed on the admin
  People page; tag them onto any project's People tab and their involvement
  is on the record. They can't hold PI/first author and never affect
  activation, visibility, or notifications.
- **Lab statistics** (`/stats`, leadership-only) — a question-first
  dashboard: portfolio state, papers and cycle times, weekly throughput,
  bottlenecks (blocker Pareto, decision latency), internal services, member
  contribution counts, thesis-milestone progress, and UTF-student
  involvement.
- **Report exports** — a printable whole-lab report (RPPR-shaped; print →
  save as PDF), Word (.docx) downloads for the lab and for any single
  project, and per-entity CSV data exports for Excel. All from the Stats
  page; the project report also has a button on each project's header.

**v13:** a global **Blockers** page (every blocker on every visible project — all statuses, searchable, with actions and Remind), a **personal calendar feed** (Account → Calendar feed: an ICS URL
with your milestones, tasks, data requests, paper targets, thesis
milestones, and compute expiries — subscribe from Google Calendar) and a
**"Your week" panel** on the Fight List showing your own overdue and
next-7-days deadlines. Plus **project comments** — every project has a Comments tab: free-form
discussion on the record, visible to everyone who can see the project;
authors (and managers) can edit or delete, and watchers get an email on
new comments. Plus one-click **Remind** buttons for leadership — on every fight card
(Fight List and Meeting mode), on open task and data-request rows, on
pending decisions, and on project milestones. One click emails the
responsible person a nudge naming the item, the deadline, and who sent it;
every send lands in the audit log.

**v12 (admin god-mode):** the admin can now change anything. **Set state
(admin)** on every project page moves a project to any workflow state
directly — no allowed-transition map, no activation or accepted-paper
checkpoints — recorded in the history and audit log as an override. And
**Database** (`/admin/db`, admin-only) is a Django-admin-style editor
generated from the schema: every table (auth included) with row counts,
search, pagination, and full row create/edit/delete with typed fields.
No validation on purpose; every write is audit-logged, and backups are the
undo button. The workflow editor also now labels each state's activity
toggle plainly — **Active state** (stall clock, age pill, running counts)
— with an "active" badge on state cards, so custom states are explicit
about whether projects in them count as active.

**v11:** detail views everywhere — every truncated table cell (data
requests, tasks, initiatives, feedback, blockers, milestone deliverables)
and every clamped fight-card detail is now clickable and opens a read-only
modal with the full text plus the record's who/when/status fields, so
nothing is ever lost to an ellipsis.

**v10:** search bars on every list page (URL-synced, so filtered views are
shareable); roomier dialogs with two-column field layouts; and **per-state
points** — in Settings → Workflow each state can carry points that the
project owner earns the first time a project reaches it (re-entries never
re-award; leadership-only visibility like all scoring).

**v8 (UI/UX polish):** fluid typography — the whole interface scales from a
16px base on phones to 18px on wide monitors, with body copy and meta text
bumped a notch and line-height at 1.5; the layout widened to the 1280–1440px
dashboard band with responsive gutters; and the header nav collapses into a
hamburger menu on smaller screens (with the fight-count badge and an Account
entry) instead of overflowing.

## Roles

Four base roles — **Admin** (the PI), **Manager** (coordinator), **Researcher**
(role key `ENGINEER`), and **Secretary** (lab staff) — plus add-ons granted on the
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
  Performance. The pointing system is **leadership-only**: researchers never
  see scores, weights, or point values anywhere — not on their account, not
  in the guide, not in the info hints.

Everyone gets the **feedback button** in the header (bug reports / feature
ideas, with your name attached); the admin triages them at `/admin/feedback`.

**No hidden rules**: every mechanism explains itself. Small (?) info hints
sit next to every non-obvious button and column (hover on desktop, tap on
phones), and the **Guide** page (`/guide`, in everyone's nav) is the full
manual — all fight rules, the lifecycle, and a playbook of how-to-win
advice (scoring weights appear only for leadership) — interpolated with the
lab's *live* configured numbers, so it can never go stale.

- **Data analyst** (add-on, any researcher): researchers file **data requests**
  on their projects; the assigned analyst (or a self-claiming one) is
  responsible for delivering. Data requests obey all anti-stall rules.
  Requests can also come from **outside Mebar** — a coordinator logs the
  external ask (who wants it, how to reach them) on `/data` and routes it to
  an analyst. External requests have no project; unrouted ones escalate as
  unowned against the logging coordinator, and once assigned they fight and
  score exactly like project requests. Only leadership sees or logs them.
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
# sara@ / omid@ / lena@ / dan@lab.local / mebar-demo (researchers)
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
- **Audit log**: `/admin/audit` (admin-only) records every high-signal
  privileged action — project transitions, PI/first-author lineup changes,
  leadership date moves on milestones/tasks/data requests, paper acceptance
  confirmations, every settings slice save, and analyst/coordinator grants.
  Newest first, most recent 500, with a `?action=` prefix filter (chips on
  the page). One honest limitation: account creation, role changes, bans,
  and password resets run through the auth provider's admin API, not the
  app's server actions, so they are **not** in the audit log.

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
  WAL, zero downtime) into `/opt/mebar-backups`, rotating after 14 days. Set
  `BACKUP_REMOTE` in the cron environment to also push each dump off-site
  (see below). Restore with `deploy/restore.sh` — **practice it monthly**.
- **Updates**: `git pull && docker compose up -d --build` — that's the whole
  procedure. Schema migrations apply automatically on container start, and an
  automatic pre-migrate backup lands next to the DB on the volume (newest 5
  kept). For big upgrades, run `deploy/backup.sh` manually first. If a
  migration fails the container exits with your data untouched — check
  `docker compose logs app`.
- **Without Docker**: `npm ci && npm run build && npm run db:migrate &&
  BETTER_AUTH_SECRET=... npm start` behind any reverse proxy; the app is a
  single Node process + one SQLite file.

### Weekly digest email

Every Monday morning each member can get a personal email: their fights, what's
due in the coming week, and their projects' freshness. Gates — SMTP must be
configured, Settings → General → Weekly digest must be on, and `CRON_SECRET`
must be set in `deploy/.env` (the trigger endpoint fails closed without it);
each person can also opt out on their own Account page. Schedule it next to
the backup cron:

    # Weekly digest — Monday 08:00
    0 8 * * 1 docker compose -f /opt/mebar-manager/deploy/docker-compose.yml exec -T app \
      node -e "fetch('http://localhost:3000/api/digest',{method:'POST',headers:{authorization:'Bearer '+process.env.CRON_SECRET}}).then(r=>r.text()).then(console.log)" \
      >> /var/log/mebar-digest.log 2>&1

The endpoint no-ops safely (and reports why) when a gate is off, so scheduling
it unconditionally is fine. Manual trigger: the same `node -e` line, any time.

### Off-site backups

The nightly dump lives on the same VPS as the database — fine for fat-finger
recovery, useless if the box dies. Point `BACKUP_REMOTE` at a second location and
`backup.sh` pushes a byte-identical copy after every local dump. A push failure is
logged but never fails the local backup.

Put the variable on the cron line (or a wrapper script):

    15 3 * * * BACKUP_REMOTE=s3:mebar-backups/nightly \
      /opt/mebar-manager/deploy/backup.sh >> /var/log/mebar-backup.log 2>&1

**Object storage / cloud (rclone, recommended).** Install rclone and configure a
remote once:

    apt install rclone      # or: curl https://rclone.org/install.sh | sudo bash
    rclone config           # create a remote named e.g. "s3" (S3, B2, Storj, GDrive…)

Then set `BACKUP_REMOTE=<remote>:<bucket>/<path>` (e.g. `s3:mebar-backups/nightly`).
Optionally set `BACKUP_REMOTE_KEEP_DAYS=30` to prune old remote copies.

**Second server (ssh/rsync).** Create a key-based login for the backup user and set
`BACKUP_REMOTE=user@host:/srv/mebar-backups`:

    ssh-keygen -t ed25519 -f ~/.ssh/mebar_backup -N ''
    ssh-copy-id -i ~/.ssh/mebar_backup.pub user@host
    # ensure the key is used non-interactively (cron has no agent), e.g. in ~/.ssh/config:
    #   Host host
    #     IdentityFile ~/.ssh/mebar_backup

The tool is auto-detected (rclone remote → `rclone copy`; otherwise `rsync -az`, then
`scp`). Force it with `BACKUP_REMOTE_METHOD=rclone|scp|rsync` if needed.

### Restore drill

Recovering is `deploy/restore.sh`. It lists the backups in `/opt/mebar-backups`
newest-first, lets you pick one (gzipped copies are auto-decompressed), runs a quick
integrity check, stops the app, swaps the file into the data volume (clearing the
stale WAL so SQLite can't replay it), restarts, and verifies row counts:

    chmod +x deploy/restore.sh
    deploy/restore.sh                       # interactive pick from /opt/mebar-backups
    deploy/restore.sh /tmp/mebar-2026….db   # or restore a copy pulled from off-site
    deploy/restore.sh /tmp/mebar-….db.gz    # gzipped copies work too

Before swapping, the script snapshots the **current** live database (WAL included)
to `/opt/mebar-backups/pre-restore-<stamp>.db` — so restoring the wrong file is
undoable: just run `restore.sh` again with the pre-restore snapshot.

Restoring an off-site copy: fetch it first (`rclone copy s3:mebar-backups/nightly/<file> .`
or `scp user@host:/srv/mebar-backups/<file> .`), then pass its path to `restore.sh`.

**Test it monthly.** A backup you have never restored is not a backup. Run the drill
on a throwaway copy of the box (or accept a few seconds of downtime and run it against
production during a quiet window) at least once a month, and confirm you can log in
and see today's data afterward.

### Schema changes (for developers)

The database is upgraded only by committed migrations in `drizzle/` — never
edit or reorder a migration that has shipped; add a new one
(`npm run db:generate` after editing `src/lib/db/schema.ts`). Databases
created before the migration system (via `db:push`) are adopted automatically:
the runner records the baseline as already applied and continues from there.
`db:push` remains for local iteration on a schema you haven't generated yet —
use it only on a database you're willing to delete.

Committed migrations so far:

- `0000` baseline (v5 schema)
- `0001` project_people + papers
- `0002` external data requests (nullable projectId, requester fields)
- `0003` paper targets (targetSubmissionAt, venueShortlist)
- `0004` user.digestOptOut
- `0005` sops
- `0006` user.onboardedAt
- `0007` person_milestones
- `0008` audit_events (append-only)
- `0009` utf_students + project_people.utf_student_id
- `0010` project_comments
