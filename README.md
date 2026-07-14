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

Other opinions built in:

- **Pausing requires a reason and a revive date.** Standby is a decision, not a drift.
- **Killing a project is a respectable outcome** — manager-only, with a reason, on the record.
- Proposals answer the **Heilmeier Catechism** (DARPA's eight questions).
- Resolved blockers are tagged by cause; the **Pareto chart** on the Fight List
  shows what systemically blocks the lab.
- Project lifecycle: `PROPOSAL → SCOPING → ACTIVE ⇄ BLOCKED → PAUSED → DONE/KILLED`,
  enforced by a state machine with full transition history.

## Stack

Next.js (App Router) · Tailwind v4 + shadcn/ui (Base UI) · Drizzle ORM +
SQLite (better-sqlite3) · better-auth (email/password + admin plugin, no
self-signup) · XState (project lifecycle) · zod · date-fns · recharts ·
vitest · Playwright (e2e).

## Quickstart

```bash
npm install
npm run db:push          # create ./data/mebar.db
npm run db:seed          # creates the first manager and prints its password once
npm run dev
```

Set `MANAGER_EMAIL` / `MANAGER_PASSWORD` before seeding to choose the first
account's credentials; otherwise a random password is generated and printed.

Want a lab that already looks alive (every fight rule triggered)?

```bash
npm run db:seed -- --demo
# prof@lab.local / mebar-demo (manager)
# sara@ / omid@ / lena@ / dan@lab.local / mebar-demo (engineers)
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | dev server |
| `npm run build && npm start` | production |
| `npm run db:push` | apply schema to SQLite |
| `npm run db:seed [-- --demo]` | seed admin (and optionally the demo lab) |
| `npm test` | unit tests (state machine + fight engine) |
| `npx tsx scripts/verify.e2e.ts` | browser click-through against a running dev server (`BASE_URL`, `CHROMIUM_PATH`, `SHOTS_DIR` to override) |

## Layout

```
src/lib/state-machine.ts   # XState project lifecycle + role gating
src/lib/fight-engine.ts    # pure stall-detection rules (the product)
src/lib/thresholds.ts      # the numbers the whole system argues from
src/lib/fight-data.ts      # DB → engine snapshot
src/lib/maintenance.ts     # lazy 48h decision auto-proceed
src/actions/               # zod-validated server actions
src/app/(app)/             # Fight List (/), /board, /projects/[id], /admin/users
scripts/seed.ts            # admin + relative-to-now demo lab
```

Auth accounts are created by managers at **People** — there is no self-signup.
Deactivating a person revokes their sessions. See `.env.example` for
production configuration (set `BETTER_AUTH_SECRET`).
