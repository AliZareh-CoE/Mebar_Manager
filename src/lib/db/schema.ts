import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { relations } from "drizzle-orm";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());

export const ROLES = ["MANAGER", "ENGINEER"] as const;
export type Role = (typeof ROLES)[number];

export const users = sqliteTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ROLES }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const sessions = sqliteTable("sessions", {
  // sha256 hash of the cookie token, never the raw token
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const PROJECT_STATES = [
  "PROPOSAL",
  "SCOPING",
  "ACTIVE",
  "BLOCKED",
  "PAUSED",
  "DONE",
  "KILLED",
] as const;
export type ProjectState = (typeof PROJECT_STATES)[number];

export const projects = sqliteTable(
  "projects",
  {
    id: id(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id),
    advisorId: text("advisor_id")
      .notNull()
      .references(() => users.id),
    state: text("state", { enum: PROJECT_STATES }).notNull().default("PROPOSAL"),
    // required at app level whenever state === PAUSED
    pauseReason: text("pause_reason"),
    reviveDate: integer("revive_date", { mode: "timestamp_ms" }),
    // Heilmeier Catechism
    objective: text("objective").notNull().default(""),
    howItsDoneToday: text("how_its_done_today").notNull().default(""),
    whatsNew: text("whats_new").notNull().default(""),
    whoCares: text("who_cares").notNull().default(""),
    risks: text("risks").notNull().default(""),
    killCriteria: text("kill_criteria").notNull().default(""),
    successCriteria: text("success_criteria").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("projects_state_idx").on(t.state),
    index("projects_owner_idx").on(t.ownerId),
  ]
);

export const stateTransitions = sqliteTable(
  "state_transitions",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    fromState: text("from_state").notNull(),
    toState: text("to_state").notNull(),
    byUserId: text("by_user_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason"),
    createdAt: createdAt(),
  },
  (t) => [index("transitions_project_idx").on(t.projectId)]
);

export const MILESTONE_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const milestones = sqliteTable(
  "milestones",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    title: text("title").notNull(),
    // "what will exist" when this milestone is done
    deliverable: text("deliverable").notNull(),
    startDate: integer("start_date", { mode: "timestamp_ms" }).notNull(),
    dueDate: integer("due_date", { mode: "timestamp_ms" }).notNull(),
    status: text("status", { enum: MILESTONE_STATUSES })
      .notNull()
      .default("PLANNED"),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("milestones_project_idx").on(t.projectId)]
);

export const CAUSE_TAGS = [
  "WAITING_DECISION",
  "WAITING_EQUIPMENT",
  "TECHNICAL",
  "WAITING_EXTERNAL",
  "KNOWLEDGE_GAP",
  "OTHER",
] as const;
export type CauseTag = (typeof CAUSE_TAGS)[number];

export const BLOCKER_STATUSES = ["OPEN", "ESCALATED", "RESOLVED"] as const;
export type BlockerStatus = (typeof BLOCKER_STATUSES)[number];

export const blockers = sqliteTable(
  "blockers",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    description: text("description").notNull(),
    causeTag: text("cause_tag", { enum: CAUSE_TAGS }).notNull(),
    ownerId: text("owner_id").references(() => users.id),
    deadline: integer("deadline", { mode: "timestamp_ms" }).notNull(),
    status: text("status", { enum: BLOCKER_STATUSES }).notNull().default("OPEN"),
    resolutionNote: text("resolution_note"),
    createdAt: createdAt(),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  },
  (t) => [
    index("blockers_status_idx").on(t.status),
    index("blockers_project_idx").on(t.projectId),
  ]
);

export const updates = sqliteTable(
  "updates",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    whatMoved: text("what_moved").notNull(),
    whatsBlocked: text("whats_blocked").notNull().default(""),
    whatsNext: text("whats_next").notNull(),
    authorId: text("author_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("updates_project_created_idx").on(t.projectId, t.createdAt)]
);

export const DECISION_STATUSES = ["PENDING", "DECIDED", "AUTO_PROCEEDED"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export const decisions = sqliteTable(
  "decisions",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    question: text("question").notNull(),
    // freeform, one option per line
    options: text("options").notNull(),
    recommendation: text("recommendation").notNull(),
    requestedFromId: text("requested_from_id")
      .notNull()
      .references(() => users.id),
    status: text("status", { enum: DECISION_STATUSES })
      .notNull()
      .default("PENDING"),
    decidedById: text("decided_by_id").references(() => users.id),
    decisionNote: text("decision_note"),
    createdAt: createdAt(),
    decidedAt: integer("decided_at", { mode: "timestamp_ms" }),
  },
  (t) => [index("decisions_status_idx").on(t.status)]
);

export const usersRelations = relations(users, ({ many }) => ({
  ownedProjects: many(projects, { relationName: "owner" }),
  advisedProjects: many(projects, { relationName: "advisor" }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
    relationName: "owner",
  }),
  advisor: one(users, {
    fields: [projects.advisorId],
    references: [users.id],
    relationName: "advisor",
  }),
  milestones: many(milestones),
  blockers: many(blockers),
  updates: many(updates),
  decisions: many(decisions),
  transitions: many(stateTransitions),
}));

export const stateTransitionsRelations = relations(stateTransitions, ({ one }) => ({
  project: one(projects, {
    fields: [stateTransitions.projectId],
    references: [projects.id],
  }),
  byUser: one(users, {
    fields: [stateTransitions.byUserId],
    references: [users.id],
  }),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  project: one(projects, {
    fields: [milestones.projectId],
    references: [projects.id],
  }),
}));

export const blockersRelations = relations(blockers, ({ one }) => ({
  project: one(projects, {
    fields: [blockers.projectId],
    references: [projects.id],
  }),
  owner: one(users, {
    fields: [blockers.ownerId],
    references: [users.id],
  }),
}));

export const updatesRelations = relations(updates, ({ one }) => ({
  project: one(projects, {
    fields: [updates.projectId],
    references: [projects.id],
  }),
  author: one(users, {
    fields: [updates.authorId],
    references: [users.id],
  }),
}));

export const decisionsRelations = relations(decisions, ({ one }) => ({
  project: one(projects, {
    fields: [decisions.projectId],
    references: [projects.id],
  }),
  requestedFrom: one(users, {
    fields: [decisions.requestedFromId],
    references: [users.id],
  }),
  decidedBy: one(users, {
    fields: [decisions.decidedById],
    references: [users.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type StateTransition = typeof stateTransitions.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Blocker = typeof blockers.$inferSelect;
export type Update = typeof updates.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
