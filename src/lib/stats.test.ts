import { describe, expect, it } from "vitest";
import { subDays, subHours } from "date-fns";
import { computeStats, STATS_WINDOW_DAYS, type StatsInput } from "./stats";
import { workflowSchema } from "./workflow";
import { DEFAULT_WORKFLOW } from "./settings-defaults";

const NOW = new Date("2026-06-15T12:00:00Z");
const STATES = workflowSchema.parse(DEFAULT_WORKFLOW).states;

const emptyInput = (): StatsInput => ({
  users: [],
  projects: [],
  updates: [],
  milestones: [],
  blockers: [],
  decisions: [],
  dataRequests: [],
  computeRequests: [],
  tasks: [],
  papers: [],
  projectPeople: [],
  utfStudents: [],
  personMilestones: [],
});

describe("computeStats", () => {
  it("empty lab computes zeros without crashing", () => {
    const s = computeStats(emptyInput(), STATES, NOW);
    expect(s.headline.projectsTotal).toBe(0);
    expect(s.cycle.medianDaysToSubmit).toBeNull();
    expect(s.bottlenecks.medianBlockerDays).toBeNull();
    expect(s.requests.data.onTimePct).toBeNull();
    expect(s.weeklyThroughput).toHaveLength(12);
    expect(s.projectsCreatedByMonth).toHaveLength(12);
  });

  it("groups projects by workflow state and falls back on unknown keys", () => {
    const input = emptyInput();
    input.projects = [
      { id: "p1", state: "ACTIVE", ownerId: "u1", createdAt: subDays(NOW, 40) },
      { id: "p2", state: "ACTIVE", ownerId: "u1", createdAt: subDays(NOW, 10) },
      { id: "p3", state: "GHOST_STATE", ownerId: "u2", createdAt: subDays(NOW, 400) },
    ];
    const s = computeStats(input, STATES, NOW);
    const active = s.projectsByState.find((x) => x.key === "ACTIVE");
    expect(active?.count).toBe(2);
    expect(active?.running).toBe(true);
    const ghost = s.projectsByState.find((x) => x.key === "GHOST_STATE");
    expect(ghost).toMatchObject({ label: "GHOST_STATE", count: 1, running: false });
    expect(s.headline.projectsRunning).toBe(2);
  });

  it("windows updates but keeps all-time counts", () => {
    const input = emptyInput();
    input.users = [{ id: "u1", name: "Sara", role: "ENGINEER", banned: false }];
    input.updates = [
      { authorId: "u1", createdAt: subDays(NOW, 5) },
      { authorId: "u1", createdAt: subDays(NOW, STATS_WINDOW_DAYS + 5) },
    ];
    const s = computeStats(input, STATES, NOW);
    expect(s.members[0]).toMatchObject({ updatesWindow: 1, updatesAll: 2 });
  });

  it("excludes secretaries and banned accounts from the member table", () => {
    const input = emptyInput();
    input.users = [
      { id: "u1", name: "Sara", role: "ENGINEER", banned: false },
      { id: "u2", name: "Taylor", role: "SECRETARY", banned: false },
      { id: "u3", name: "Gone", role: "ENGINEER", banned: true },
    ];
    const s = computeStats(input, STATES, NOW);
    expect(s.members.map((m) => m.name)).toEqual(["Sara"]);
  });

  it("rolls papers up per venue including the no-venue bucket", () => {
    const input = emptyInput();
    input.papers = [
      { projectId: "p1", status: "ACCEPTED", venue: "Nature Photonics", submittedAt: subDays(NOW, 60), acceptedAt: subDays(NOW, 10) },
      { projectId: "p2", status: "SUBMITTED", venue: "Nature Photonics", submittedAt: subDays(NOW, 5), acceptedAt: null },
      { projectId: "p3", status: "DRAFTING", venue: null, submittedAt: null, acceptedAt: null },
    ];
    const s = computeStats(input, STATES, NOW);
    expect(s.perVenue[0]).toMatchObject({ venue: "Nature Photonics", accepted: 1, submitted: 1 });
    expect(s.perVenue.find((v) => v.venue === "No venue yet")?.drafting).toBe(1);
    expect(s.cycle.medianDaysToAccept).toBe(50);
  });

  it("computes cycle medians from project start and submission", () => {
    const input = emptyInput();
    input.projects = [
      { id: "p1", state: "ACTIVE", ownerId: "u1", createdAt: subDays(NOW, 100) },
      { id: "p2", state: "ACTIVE", ownerId: "u1", createdAt: subDays(NOW, 30) },
    ];
    input.papers = [
      { projectId: "p1", status: "SUBMITTED", venue: "A", submittedAt: subDays(NOW, 40), acceptedAt: null },
      { projectId: "p2", status: "SUBMITTED", venue: "B", submittedAt: subDays(NOW, 10), acceptedAt: null },
    ];
    const s = computeStats(input, STATES, NOW);
    // 60 and 20 days → median rounds to 40
    expect(s.cycle.medianDaysToSubmit).toBe(40);
  });

  it("data request on-time percentage counts only delivered rows", () => {
    const input = emptyInput();
    input.dataRequests = [
      { status: "DELIVERED", externalRequester: null, neededBy: NOW, deliveredAt: subDays(NOW, 1) },
      { status: "DELIVERED", externalRequester: "IST Austria", neededBy: subDays(NOW, 10), deliveredAt: subDays(NOW, 2) },
      { status: "OPEN", externalRequester: null, neededBy: NOW, deliveredAt: null },
    ];
    const s = computeStats(input, STATES, NOW);
    expect(s.requests.data).toMatchObject({ open: 1, delivered: 2, onTimePct: 50, external: 1 });
  });

  it("decision median uses decided rows and counts auto-proceeds separately", () => {
    const input = emptyInput();
    input.decisions = [
      { status: "DECIDED", createdAt: subHours(NOW, 30), decidedAt: subHours(NOW, 20) },
      { status: "DECIDED", createdAt: subHours(NOW, 100), decidedAt: subHours(NOW, 70) },
      { status: "AUTO_PROCEEDED", createdAt: subHours(NOW, 200), decidedAt: null },
    ];
    const s = computeStats(input, STATES, NOW);
    expect(s.bottlenecks.medianDecisionHours).toBe(20);
    expect(s.bottlenecks.autoProceeded).toBe(1);
  });

  it("UTF rollup: cross-project tags count, archived-but-tagged stays listed", () => {
    const input = emptyInput();
    input.projects = [
      { id: "p1", state: "ACTIVE", ownerId: "u1", createdAt: subDays(NOW, 50) },
      { id: "p2", state: "DONE", ownerId: "u1", createdAt: subDays(NOW, 300) },
    ];
    input.utfStudents = [
      { id: "s1", name: "Lily", archived: false },
      { id: "s2", name: "Mateo", archived: true },
      { id: "s3", name: "Untagged Archived", archived: true },
    ];
    input.projectPeople = [
      { projectId: "p1", userId: null, utfStudentId: "s1", role: "UTF_STUDENT" },
      { projectId: "p2", userId: null, utfStudentId: "s1", role: "UTF_STUDENT" },
      { projectId: "p2", userId: null, utfStudentId: "s2", role: "UTF_STUDENT" },
      { projectId: "p1", userId: "u1", utfStudentId: null, role: "PI" },
    ];
    input.papers = [
      { projectId: "p2", status: "ACCEPTED", venue: "X", submittedAt: subDays(NOW, 200), acceptedAt: subDays(NOW, 150) },
    ];
    const s = computeStats(input, STATES, NOW);
    expect(s.utf.map((u) => u.name)).toEqual(["Lily", "Mateo"]);
    expect(s.utf[0]).toMatchObject({ projectsTagged: 2, running: 1, done: 1, papersAccepted: 1 });
    expect(s.utf[1]).toMatchObject({ projectsTagged: 1, archived: true });
    expect(s.headline.utfActive).toBe(1);
  });

  it("person milestones split planned / overdue / done", () => {
    const input = emptyInput();
    input.personMilestones = [
      { status: "PLANNED", dueDate: subDays(NOW, 3) },
      { status: "PLANNED", dueDate: subDays(NOW, -30) },
      { status: "DONE", dueDate: subDays(NOW, 100) },
    ];
    const s = computeStats(input, STATES, NOW);
    expect(s.students).toEqual({ planned: 1, overdue: 1, done: 1 });
  });

  it("weekly throughput buckets land in the right ISO weeks", () => {
    const input = emptyInput();
    input.updates = [
      { authorId: "u1", createdAt: NOW },
      { authorId: "u1", createdAt: subDays(NOW, 7) },
      { authorId: "u1", createdAt: subDays(NOW, 120) }, // outside the 12 weeks
    ];
    input.blockers = [
      { causeTag: "x", status: "RESOLVED", ownerId: "u1", createdAt: subDays(NOW, 10), resolvedAt: NOW },
    ];
    const s = computeStats(input, STATES, NOW);
    const total = s.weeklyThroughput.reduce((sum, w) => sum + w.updates, 0);
    expect(total).toBe(2);
    expect(s.weeklyThroughput[11].updates).toBe(1);
    expect(s.weeklyThroughput[11].blockersResolved).toBe(1);
    expect(s.bottlenecks.medianBlockerDays).toBe(10);
  });
});
