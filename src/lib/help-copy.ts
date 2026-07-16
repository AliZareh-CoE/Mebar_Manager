import type { FightType } from "@/lib/fight-types";
import type { ThresholdSettings, PerformanceSettings } from "@/lib/settings-schema";
import type { HelpCopy } from "@/components/info-hint";

/**
 * The one place every explanation lives — the in-place info hints and the
 * /guide page both read from here, so they can never drift apart. Pure:
 * server pages build strings from getSettings() and pass them down as
 * props; client components never import this module (bundle hygiene).
 *
 * Copy rules: 1-3 sentences; the first states the rule with the LIVE
 * number; the last says what to do. Numbers come ONLY from ctx — never
 * hardcode a default (the tests plant sentinel values to catch it).
 * And per the PI: not just punishment — every rule carries `advice`,
 * how to WIN, not merely how to stop losing.
 */

export interface HelpContext {
  thresholds: ThresholdSettings;
  performance: PerformanceSettings;
  /**
   * The pointing system is leadership-only — researchers never see scores,
   * weights, or point values anywhere. Fail-closed: omitted means false,
   * so a forgotten call site leaks nothing.
   */
  viewerSeesScores?: boolean;
}

export interface FightRuleHelp {
  /** What trips it (live numbers). */
  what: string;
  /** Who it yells at. */
  who: string;
  /** How to clear it. */
  clear: string;
  /** How to win — the coaching, not the whip. */
  advice: string;
}

/**
 * Exhaustive by construction: adding a FightType without an entry here is
 * a compile error, so the guide can never silently miss a rule.
 */
export const FIGHT_TYPE_HELP: Record<FightType, (ctx: HelpContext) => FightRuleHelp> = {
  STALLED_PROJECT: ({ thresholds: t }) => ({
    what: `An active project with no update for ${t.stallDays} days. Silence is how projects die.`,
    who: "The project owner.",
    clear: "Post an update — even “stuck on X” counts and resets the clock.",
    advice:
      "Book one fixed slot a week (Friday, before the meeting) and write the 5-minute template: what moved, what's blocked, what's next. The update is the work's heartbeat, not extra work.",
  }),
  PAST_REVIVE: ({ thresholds: t }) => ({
    what: "A paused project that slept past its own revive date.",
    who: "The advisor — revive it or kill it.",
    clear: "Fire Revive (it becomes active again) or Kill with a reason.",
    advice: `Pausing is a decision, not a drift — set revive dates you actually believe, and treat the revival like a fresh start: the stall clock restarts, but so does the ${t.stallDays}-day update expectation.`,
  }),
  OVERDUE_BLOCKER: () => ({
    what: "An open blocker past its deadline. These had deadlines; the deadlines lost.",
    who: "The blocker's owner (the advisor if nobody owns it).",
    clear: "Resolve it with a cause tag, or escalate it to leadership.",
    advice:
      "Timebox being stuck: write down what you tried and what you need — writing it solves half of them on the spot, and the other half becomes escalatable in one paste.",
  }),
  OVERDUE_DATA_REQUEST: () => ({
    what: "An open data request past its needed-by date — from a project, or from outside Mebar.",
    who: "The assigned analyst (the advisor, or for external asks the coordinator who logged it, if unassigned).",
    clear: "Deliver it with a note, or renegotiate the date with leadership.",
    advice:
      "Analysts: deliver partials early — a sample file on day one catches format problems before they cost the full deadline.",
  }),
  OVERDUE_TASK: () => ({
    what: "A task past its deadline.",
    who: "The assigned secretary (the requester's problem if unassigned).",
    clear: "Mark it done with a completion note, or cancel it with a reason.",
    advice:
      "Deadlines you set are locked afterwards — set dates you believe, with slack for vendors and bureaucracy, because the board remembers.",
  }),
  OVERDUE_COMPUTE_RESULTS: ({ thresholds: t }) => ({
    what: `An approved compute request past its usage window with no results summary. Red after ${t.computeResultsUrgentDays} extra days.`,
    who: "The requester — the hours were spent; the lab is owed the story.",
    clear: "Submit the results summary: outcomes vs. what you promised.",
    advice:
      "Retrieve data, checkpoints, and outputs BEFORE the window ends — nothing on the server is guaranteed to survive it. Write the summary the same day; it's 10 minutes while it's fresh and an afternoon a month later.",
  }),
  UNOWNED_BLOCKER: ({ thresholds: t, viewerSeesScores }) => ({
    what: `An open blocker nobody owns, ${t.unownedGraceDays} days of grace spent.`,
    who: "The project's advisor.",
    clear: "Assign an owner — including yourself.",
    advice: viewerSeesScores
      ? "Ownership isn't blame, it's permission to act. The person who takes an unowned blocker earns delivery points for resolving it."
      : "Ownership isn't blame, it's permission to act. The person who takes an unowned blocker is the one who gets to close it.",
  }),
  UNOWNED_DATA_REQUEST: ({ thresholds: t }) => ({
    what: `A data request with no analyst for ${t.unownedGraceDays} days — including external asks a coordinator logged but hasn't routed yet.`,
    who: "The project's advisor (the logging coordinator, for external requests).",
    clear: "Assign an analyst, or an analyst claims it themselves.",
    advice: "Coordinators: route external asks to an analyst the day they land. Analysts: claiming early beats being assigned late — you pick the work while it's still plannable.",
  }),
  UNOWNED_TASK: ({ thresholds: t }) => ({
    what: `A task no secretary has claimed for ${t.unownedGraceDays} days.`,
    who: "Whoever filed it — and every secretary who could claim it.",
    clear: "Assign or claim it.",
    advice: "Filers: a task with a fuzzy description stays unclaimed. Write what done looks like.",
  }),
  PENDING_COMPUTE_REQUEST: ({ thresholds: t }) => ({
    what: `Every pending compute request. It never auto-proceeds; it turns red after ${t.computePendingUrgentHours} hours undecided.`,
    who: "The compute coordinator — only they decide.",
    clear: "Approve with a window, or deny with a reason.",
    advice:
      "Requesters: the bar is the checklist — hours, utilization plan, preprocessed data with exact size, a dry run, expected results. A request that passes the bar gets decided fast because there's nothing left to argue about.",
  }),
  PENDING_DECISION: ({ thresholds: t, viewerSeesScores }) => ({
    what: `Every pending decision. After ${t.decisionTimeoutHours} hours it auto-proceeds with the researcher's recommendation; red in the final ${t.decisionUrgentHours} hours.`,
    who: "Whoever the decision was requested from — usually the advisor.",
    clear: "Decide it. Even “no” is faster than silence.",
    advice: viewerSeesScores
      ? "Researchers: write the recommendation you'd defend in the meeting — the timeout means YOUR judgment ships by default, so make it shippable. Advisors: an auto-proceeded decision costs you points; deciding costs you two minutes."
      : "Researchers: write the recommendation you'd defend in the meeting — the timeout means YOUR judgment ships by default, so make it shippable. Advisors: an auto-proceeded decision goes on your record; deciding costs you two minutes.",
  }),
  MISSED_MILESTONE: () => ({
    what: "A milestone past due, not done, on a project that's still moving.",
    who: "The project owner.",
    clear: "Mark it done, cancel it with a reason, or have leadership push the date — deliberately, on the record.",
    advice:
      "Milestones are deliverables, not activities: “a plot of open- vs closed-loop noise”, never “work on the controller”. If you can't name the artifact, the milestone isn't ready to exist. Two-week granularity keeps them honest.",
  }),
  OVERDUE_INITIATIVE: () => ({
    what: "A leadership initiative past its deadline — a big fight going badly.",
    who: "The assigned fighter (the filer if unassigned).",
    clear: "Close it WON or LOST with the story, or keep fighting and say so.",
    advice:
      "University battles run on persistence and paper trails: after every meeting, write one line of what was promised. LOST with a documented fight is respectable; expired in silence is not.",
  }),
  UNOWNED_INITIATIVE: ({ thresholds: t }) => ({
    what: `An initiative nobody claimed for ${t.unownedGraceDays} days.`,
    who: "Whoever filed it — and all of leadership.",
    clear: "Claim it or assign a fighter.",
    advice: "One named fighter beats a committee. Initiatives with owners get won; initiatives “we should all push on” expire.",
  }),
  MISSING_PROJECT_PEOPLE: () => ({
    what: "An active project without a named PI and first author.",
    who: "The project owner.",
    clear: "Set them on the People tab — activation is blocked without them, so this only happens to legacy or edited lineups.",
    advice:
      "Settle authorship at the START — it's a 2-minute conversation at activation and a feud after submission. The lineup locks once active precisely so nobody relitigates it later.",
  }),
  PAPERLESS_PROJECT: ({ thresholds: t, performance: p, viewerSeesScores }) => ({
    what: `The early warning: a project only finishes when its paper is ACCEPTED (Done is blocked without one), and this project has been active ${t.paperGraceDays}+ days with not even a draft filed.`,
    who: "The project owner.",
    clear: "File the paper on the Papers tab — a draft clears this and starts the real fight.",
    advice: `Pick your top 3 target journals BEFORE writing (best fit → strong alternative → reliable fallback) and write to Target 1's format from day one. Draft the methods section while the experiments run.${viewerSeesScores ? ` Filing the draft early also banks the ${p.weights.paperSubmitted}-point submission the moment it's ready.` : " Filing the draft early means it's ready to submit the moment the results land."}`,
  }),
  UNDERLOADED_RESEARCHER: ({ thresholds: t }) => ({
    what: `A researcher who is owner or advisor of fewer than ${t.minActiveProjects} running projects. Only healthy, moving projects count — blocked, stalled, paused, or not-yet-started ones don't. Applies to researchers only: data analysts, secretaries, and leadership are exempt.`,
    who: "The researcher.",
    clear: "Unstick what's blocked or stalled, or file a proposal and get it activated — the count updates the moment a project is running again.",
    advice: `Running ${t.minActiveProjects} projects is a portfolio, not a juggling act: stagger their maturity — a couple in early experiments, a couple mid-campaign, one in writing (a project being written up is still running) — so they queue behind each other's dead time (reviews, deliveries, compute windows) instead of competing for the same afternoon. Give each project its own time block and never multitask inside one. And keep proposals in scoping ON TOP of the ${t.minActiveProjects} — they don't count until activated, so file the next one BEFORE you're under the bar. A blocked or stalled project silently drops out of your count too, so unsticking one is as good as starting one.`,
  }),
  SUBMISSION_TARGET_AT_RISK: ({ thresholds: t }) => ({
    what: `A draft whose target submission date is within ${t.submissionLeadDays} days — or already past it. The date you set to submit is nearly here and it's still a draft.`,
    who: "The project owner.",
    clear: "Submit it (that clears the fight and starts the review clock), or ask a coordinator to move the target date deliberately.",
    advice:
      "Set the target the day you start drafting and write backwards from it: methods and figures while the experiments run, so the last week is polish, not panic. Keep your journal shortlist ranked so the moment it's ready you already know where it goes.",
  }),
  OVERDUE_PERSON_MILESTONE: () => ({
    what: "A thesis-track milestone (qualifier, proposal defense, submission) past its due date.",
    who: "The student it belongs to — with their advisor.",
    clear: "Mark it done, or have leadership push the date deliberately, on the record.",
    advice:
      "Thesis milestones are the long game: set the qualifier, the proposal defense, and the submission dates at the start of the year and work backwards. A milestone with a believable date beats three vague intentions — and the date locks once set, so pick one you'll defend.",
  }),
};

/** Fold a fight rule's help into the {title, body} shape InfoHint renders. */
export function fightTypeHelpCopy(type: FightType, ctx: HelpContext): HelpCopy {
  const h = FIGHT_TYPE_HELP[type](ctx);
  return {
    title: "Why is this here?",
    body: [h.what, `Yells at: ${h.who}`, `Clear it: ${h.clear}`, `Win: ${h.advice}`],
  };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- type source
const MECHANISMS = [
  "escalate",
  "transitions",
  "lineupLock",
  "agePill",
  "autoProceed",
  "dateLock",
  "papers",
  "paretoCause",
  "perfDelivery",
  "perfDiscipline",
  "perfInitiative",
  "perfTotal",
  "computeResultsOwed",
  "computeBar",
  "accountScore",
] as const;
export type MechanismId = (typeof MECHANISMS)[number];

export const MECHANISM_HELP: Record<MechanismId, (ctx: HelpContext) => HelpCopy> = {
  escalate: ({ thresholds: t }) => ({
    title: "What Escalate does",
    body: [
      `Escalation puts this blocker in front of leadership NOW: it skips the ${t.unownedGraceDays}-day grace, jumps straight to red at the top of the Fight List, and lands on the advisor until someone takes it.`,
      "It can never be un-escalated or buried — only resolved. Use it when waiting taught you nothing. Nobody has ever been punished for escalating too early.",
    ],
  }),
  transitions: ({ thresholds: t }) => ({
    title: "Moving a project",
    body: [
      "Researchers file and work projects; only leadership activates them — and never without a PI and first author on the People tab.",
      `Pausing needs a reason and a revive date (drifting into standby is not a thing here). A project has exactly two endings: Done — blocked until its paper is ACCEPTED — or Kill (leadership-only, reason on the record; a respectable outcome, not a shame). Anything active goes stale after ${t.stallDays} silent days.`,
    ],
  }),
  lineupLock: () => ({
    title: "PI & first author",
    body: [
      "Every active project names exactly one PI and one first author — members or external people. Activation is blocked until both exist.",
      "Once active, the lineup is leadership's to change, not yours: credit isn't self-serve. Contributors can still come and go. Settle authorship at the start — it's a conversation at activation and a feud after submission.",
    ],
  }),
  agePill: ({ thresholds: t }) => ({
    title: "The age pill",
    body: [
      `Days since anything moved — an update or an activation. Green up to ${t.ageFreshDays}d, amber to ${t.ageAgingDays}d, red past that.`,
      `Red pills are pre-fights: at ${t.stallDays} silent days the Fight List takes over. Clear them before it does.`,
    ],
  }),
  autoProceed: ({ thresholds: t, performance: p, viewerSeesScores }) => ({
    title: "Decisions auto-proceed",
    body: [
      viewerSeesScores
        ? `The person asked has ${t.decisionTimeoutHours} hours; it turns red for the final ${t.decisionUrgentHours}. After that the researcher's recommendation proceeds automatically — and the sleeper's score eats ${p.weights.decisionAutoProceeded} points.`
        : `The person asked has ${t.decisionTimeoutHours} hours; it turns red for the final ${t.decisionUrgentHours}. After that the researcher's recommendation proceeds automatically — and the silence goes on the sleeper's record.`,
      "Researchers: write the recommendation you'd defend in the meeting — your judgment ships by default. Default to action.",
    ],
  }),
  dateLock: ({ viewerSeesScores }) => ({
    title: "Why dates won't move",
    body: [
      viewerSeesScores
        ? "Due dates and deadlines feed the on-time scoring, so once set they're locked for researchers — only leadership moves them, deliberately, on the record."
        : "Due dates and deadlines are commitments on the record, so once set they're locked for researchers — only leadership moves them, deliberately, on the record.",
      viewerSeesScores
        ? "Missed one? Close it late (still worth points) or ask a coordinator to push it. Set dates you believe in the first place."
        : "Missed one? Close it late (better late than abandoned) or ask a coordinator to push it. Set dates you believe in the first place.",
    ],
  }),
  papers: ({ thresholds: t, performance: p, viewerSeesScores }) => ({
    title: "The paper track",
    body: [
      `A project only finishes when its paper is ACCEPTED — “Mark done” is blocked without one, and “no paper” after ${t.paperGraceDays} active days is already a fight. A draft counts for the fight; only acceptance finishes the project.`,
      viewerSeesScores
        ? `Submitting earns the owner ${p.weights.paperSubmitted} points; an acceptance earns ${p.weights.paperAccepted}, once a coordinator confirms it — the biggest prize needs a second pair of eyes. Rejections resubmit on the same row, reasons on the record.`
        : "An acceptance counts once a coordinator confirms it — the biggest milestone needs a second pair of eyes. Rejections resubmit on the same row, reasons on the record.",
      "Win: pick 3 target journals before writing (best fit → alternative → reliable fallback), write to Target 1's format, and draft methods while the experiments run.",
      "Set a target submission date on the draft and keep your ranked venue shortlist filled: the date turns the row red as it approaches so nothing quietly slips, and resubmitting a rejected paper pre-fills the next journal on your list.",
    ],
  }),
  paretoCause: () => ({
    title: "Cause tags",
    body: [
      "Every resolved blocker is tagged by what caused it. The tags feed the “What keeps blocking us” chart on the Fight List — the tallest bar is the systemic fight worth picking at the monthly review.",
      "Tag honestly: the chart is how the lab notices that, say, procurement — not science — is eating its months.",
    ],
  }),
  perfDelivery: ({ performance: p }) => ({
    title: "Delivery",
    body: [
      `Closing things, on the record: milestones (+${p.weights.milestoneDone}, +${p.weights.milestoneOnTime} on time), blockers resolved (+${p.weights.blockerResolved}), data delivered, decisions answered, compute results, initiatives won (+${p.weights.initiativeWon}), papers submitted (+${p.weights.paperSubmitted}) and accepted (+${p.weights.paperAccepted}).`,
      "Win by finishing, not by starting: two closed milestones beat five open ones.",
    ],
  }),
  perfDiscipline: ({ performance: p }) => ({
    title: "Discipline",
    body: [
      `The weekly rhythm: +${p.weights.updatePosted} per update (capped at ${p.updatesCapPerProjectPerWeek}/project/week — spamming doesn't pay), ${p.weights.overdueOwnedItem} per item currently rotting on you, ${p.weights.decisionAutoProceeded} per decision you slept through.`,
      "The score reads the record; nobody grades anybody. Clear your fights and this column takes care of itself.",
    ],
  }),
  perfInitiative: ({ performance: p }) => ({
    title: "Initiative-taking",
    body: [
      `Starting fights instead of suffering silently: proposals filed (+${p.weights.proposalFiled}), blockers raised (+${p.weights.blockerRaised}), tasks and data requests filed, initiatives filed (+${p.weights.initiativeFiled}).`,
      "Raising a blocker is professionalism, not failure — and it pays.",
    ],
  }),
  perfTotal: ({ performance: p }) => ({
    title: "How scoring works",
    body: [
      `Everything is counted from the record over the last ${p.windowDays} days and multiplied by admin-tunable weights — same formula for everyone, nobody exempt.`,
      "Every count is visible in your breakdown, and the inputs (deadlines, lineups, acceptances) are locked against after-the-fact editing. Don't chase points: the weights are aligned so clearing fights and shipping papers IS the optimal strategy.",
    ],
  }),
  computeResultsOwed: ({ thresholds: t }) => ({
    title: "Results are owed",
    body: [
      `When an approved window closes, a results summary (outcomes vs. what you promised) is due — red after ${t.computeResultsUrgentDays} extra days.`,
      "Retrieve data, checkpoints, and outputs before the window ends; the server owes you nothing after. Write the summary the same day, while it's 10 minutes instead of an afternoon.",
    ],
  }),
  computeBar: ({ thresholds: t }) => ({
    title: "How compute gets approved",
    body: [
      `Only the compute coordinator decides — never a manager fallback, and requests never auto-proceed (red after ${t.computePendingUrgentHours} hours undecided).`,
      "The bar: server type + hours, a utilization plan (sweeps, ablations, schedule, metrics), fully preprocessed data with the exact size, dry-run evidence, and expected results. Pass the bar and approval is fast — there's nothing left to argue about.",
    ],
  }),
  accountScore: ({ performance: p }) => ({
    title: "Your score",
    body: [
      `Computed from the record over the last ${p.windowDays} days — delivery, discipline, initiative-taking. Same formula for everyone, leadership included.`,
      "Expand the breakdown to see every counted event. The way up: clear your fights, post the weekly update, ship the paper.",
    ],
  }),
};
