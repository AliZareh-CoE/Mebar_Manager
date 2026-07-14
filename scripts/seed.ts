/**
 * Seed script.
 *   npm run db:seed            → first manager account only (idempotent)
 *   npm run db:seed -- --demo  → wipe domain data and load full demo lab
 *
 * Demo timestamps are relative to *now* so every fight rule lights up no
 * matter when you run it.
 */
import { eq } from "drizzle-orm";
import { subDays, addDays, subHours } from "date-fns";
import { hashPassword } from "better-auth/crypto";
import { db } from "../src/lib/db";
import {
  user,
  account,
  projects,
  stateTransitions,
  milestones,
  blockers,
  updates,
  decisions,
} from "../src/lib/db/schema";

async function createUserRaw(input: {
  name: string;
  email: string;
  password: string;
  role: "MANAGER" | "ENGINEER";
}): Promise<string> {
  const existing = await db
    .select()
    .from(user)
    .where(eq(user.email, input.email))
    .get();
  if (existing) return existing.id;

  const userId = crypto.randomUUID();
  const now = new Date();
  const passwordHash = await hashPassword(input.password);
  // One transaction so a crash can't leave a user without a credential
  // account (which the idempotency check above couldn't repair).
  db.transaction((tx) => {
    tx.insert(user)
      .values({
        id: userId,
        name: input.name,
        email: input.email,
        emailVerified: true,
        role: input.role,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    // Credential account the way better-auth's email/password provider stores it.
    tx.insert(account)
      .values({
        id: crypto.randomUUID(),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  });
  return userId;
}

async function seedAdmin() {
  const email = process.env.MANAGER_EMAIL ?? "admin@lab.local";
  // Never default to a documented constant: without MANAGER_PASSWORD a random
  // password is generated and printed exactly once.
  const generated = !process.env.MANAGER_PASSWORD;
  const password =
    process.env.MANAGER_PASSWORD ?? crypto.randomUUID().replaceAll("-", "").slice(0, 16);

  const existing = await db.select().from(user).where(eq(user.email, email)).get();
  if (existing) {
    console.log(`Manager account already exists: ${email}`);
    return;
  }

  await createUserRaw({ name: "Lab Manager", email, password, role: "MANAGER" });
  console.log(`Manager account created: ${email} / ${password}`);
  if (generated) {
    console.log("(random password — save it now, it is not stored anywhere else)");
  }
}

async function seedDemo() {
  // Wipe domain data (keep auth accounts).
  db.delete(updates).run();
  db.delete(decisions).run();
  db.delete(blockers).run();
  db.delete(milestones).run();
  db.delete(stateTransitions).run();
  db.delete(projects).run();

  const password = "mebar-demo";
  const prof = await createUserRaw({
    name: "Prof. Mebar",
    email: "prof@lab.local",
    password,
    role: "MANAGER",
  });
  const sara = await createUserRaw({
    name: "Sara Kim",
    email: "sara@lab.local",
    password,
    role: "ENGINEER",
  });
  const omid = await createUserRaw({
    name: "Omid Rahimi",
    email: "omid@lab.local",
    password,
    role: "ENGINEER",
  });
  const lena = await createUserRaw({
    name: "Lena Fischer",
    email: "lena@lab.local",
    password,
    role: "ENGINEER",
  });
  const dan = await createUserRaw({
    name: "Dan Okafor",
    email: "dan@lab.local",
    password,
    role: "ENGINEER",
  });

  const heilmeier = {
    objective: "Reduce vibration noise on the cryo stage below 5 nm RMS.",
    howItsDoneToday: "Passive isolation tables; limited below 10 Hz.",
    whatsNew: "Active feedback with piezo actuators driven by our own controller.",
    whoCares: "Every group imaging at cryogenic temperatures.",
    risks: "Controller latency may not keep up with resonance modes.",
    killCriteria: "If closed-loop noise isn't <20 nm by milestone 3, stop.",
    successCriteria: "5 nm RMS sustained for 1 hour, reproduced twice.",
  };

  const addProject = (v: typeof projects.$inferInsert) =>
    db.insert(projects).values(v).returning().get();

  // P1 — ACTIVE, stalled 21d, overdue blocker, missed milestone.
  const p1 = addProject({
    title: "Cryo-stage vibration isolation",
    description: "Active vibration cancellation for the cryostat imaging stage.",
    ownerId: sara,
    advisorId: prof,
    state: "ACTIVE",
    createdAt: subDays(new Date(), 90),
    ...heilmeier,
  });
  db.insert(updates)
    .values({
      projectId: p1.id,
      whatMoved: "Characterized the resonance modes of the stage.",
      whatsBlocked: "Waiting for the replacement piezo driver.",
      whatsNext: "Test the controller loop on the small stage.",
      authorId: sara,
      createdAt: subDays(new Date(), 21),
    })
    .run();
  db.insert(blockers)
    .values({
      projectId: p1.id,
      description:
        "Piezo driver died. Tried the spare — also dead. Need a replacement from the vendor or a loaner from the optics group.",
      causeTag: "WAITING_EQUIPMENT",
      ownerId: sara,
      deadline: subDays(new Date(), 5),
      status: "OPEN",
      createdAt: subDays(new Date(), 12),
    })
    .run();
  db.insert(milestones)
    .values([
      {
        projectId: p1.id,
        title: "Closed-loop test on small stage",
        deliverable: "A plot of open vs closed-loop noise spectra.",
        startDate: subDays(new Date(), 17),
        dueDate: subDays(new Date(), 3),
        status: "IN_PROGRESS",
      },
      {
        projectId: p1.id,
        title: "Full-stage integration",
        deliverable: "Controller running on the cryostat stage.",
        startDate: addDays(new Date(), 4),
        dueDate: addDays(new Date(), 18),
        status: "PLANNED",
      },
    ])
    .run();

  // P2 — ACTIVE and healthy.
  const p2 = addProject({
    title: "Femtosecond pulse shaper",
    description: "Programmable pulse shaping for the pump-probe line.",
    ownerId: omid,
    advisorId: prof,
    state: "ACTIVE",
    createdAt: subDays(new Date(), 40),
    objective: "Arbitrary spectral phase control with <5% amplitude ripple.",
    whatsNew: "Off-the-shelf SLM with our own calibration routine.",
    whoCares: "The whole ultrafast subgroup.",
    howItsDoneToday: "Fixed prism compressor; no programmable control.",
    risks: "SLM damage threshold at full pump power.",
    killCriteria: "If calibration drift >10%/day persists after fixes, stop.",
    successCriteria: "Transform-limited pulse recovered from arbitrary input.",
  });
  db.insert(updates)
    .values({
      projectId: p2.id,
      whatMoved: "Calibration routine converges in 4 iterations now.",
      whatsBlocked: "",
      whatsNext: "Damage-threshold test at 60% pump power.",
      authorId: omid,
      createdAt: subDays(new Date(), 2),
    })
    .run();
  db.insert(milestones)
    .values({
      projectId: p2.id,
      title: "Damage threshold characterization",
      deliverable: "A table of safe operating powers per wavelength.",
      startDate: subDays(new Date(), 3),
      dueDate: addDays(new Date(), 6),
      status: "IN_PROGRESS",
    })
    .run();

  // P3 — BLOCKED: unowned blocker (4d), one countdown decision (26h),
  // one 3d-old decision that auto-proceeds on first page load.
  const p3 = addProject({
    title: "ML defect classifier",
    description: "CNN classifier for wafer defect micrographs.",
    ownerId: lena,
    advisorId: prof,
    state: "BLOCKED",
    createdAt: subDays(new Date(), 55),
    objective: "Classify 6 defect classes at >95% precision.",
    howItsDoneToday: "Manual inspection, ~2h per wafer batch.",
    whatsNew: "Transfer learning on our 40k-image archive.",
    whoCares: "Fab partners drowning in inspection backlog.",
    risks: "Label noise in the archive.",
    killCriteria: "If precision plateaus <85% after augmentation, stop.",
    successCriteria: "95% precision on the held-out batch.",
  });
  db.insert(updates)
    .values({
      projectId: p3.id,
      whatMoved: "Baseline ResNet hits 88% precision.",
      whatsBlocked: "GPU node allocation expired.",
      whatsNext: "Augmentation sweep once compute is back.",
      authorId: lena,
      createdAt: subDays(new Date(), 6),
    })
    .run();
  db.insert(blockers)
    .values({
      projectId: p3.id,
      description:
        "Cluster GPU allocation expired. Tried the fair-share queue — 6 day wait. Need someone with admin quota to bump us.",
      causeTag: "WAITING_EXTERNAL",
      ownerId: null,
      deadline: addDays(new Date(), 2),
      status: "OPEN",
      createdAt: subDays(new Date(), 4),
    })
    .run();
  db.insert(decisions)
    .values([
      {
        projectId: p3.id,
        question: "Buy a dedicated GPU workstation or keep fighting for cluster time?",
        options: "1. Buy a 2-GPU workstation (~$8k)\n2. Keep using the shared cluster\n3. Cloud credits",
        recommendation: "Buy the workstation — cluster contention has cost us 3 weeks this quarter.",
        requestedFromId: prof,
        status: "PENDING",
        createdAt: subHours(new Date(), 22),
      },
      {
        projectId: p3.id,
        question: "Include the noisy 2019 labels in training?",
        options: "1. Include with label smoothing\n2. Exclude entirely",
        recommendation: "Exclude — they cover classes we already saturate.",
        requestedFromId: prof,
        status: "PENDING",
        createdAt: subDays(new Date(), 3),
      },
    ])
    .run();

  // P4 — PAUSED, revive date 10 days ago.
  const p4 = addProject({
    title: "Quantum dot synthesis v2",
    description: "Reproducible CdSe dot synthesis with narrower size dispersion.",
    ownerId: dan,
    advisorId: prof,
    state: "PAUSED",
    pauseReason: "Fume hood certification expired; chemistry on hold.",
    reviveDate: subDays(new Date(), 10),
    createdAt: subDays(new Date(), 120),
    objective: "Size dispersion <5% batch to batch.",
    howItsDoneToday: "Hot-injection with manual timing; 12% dispersion.",
    whatsNew: "Automated injection with inline absorbance monitoring.",
    whoCares: "The LED integration project depends on it.",
    risks: "Precursor supplier variability.",
    killCriteria: "If dispersion >8% after automation, stop.",
    successCriteria: "Three consecutive batches under 5%.",
  });
  db.insert(stateTransitions)
    .values([
      {
        projectId: p4.id,
        fromState: "ACTIVE",
        toState: "PAUSED",
        byUserId: prof,
        reason: "Fume hood certification expired; chemistry on hold.",
        createdAt: subDays(new Date(), 40),
      },
    ])
    .run();

  // P5 — PROPOSAL with full Heilmeier answers.
  addProject({
    title: "Terahertz imaging line",
    description: "THz transmission imaging for package inspection.",
    ownerId: omid,
    advisorId: prof,
    state: "PROPOSAL",
    createdAt: subDays(new Date(), 5),
    objective: "Image through epoxy packaging at 1 mm resolution.",
    howItsDoneToday: "X-ray CT — expensive, off-site, 2-week turnaround.",
    whatsNew: "Fiber-coupled THz TDS with our fast delay line.",
    whoCares: "Two industry partners asked for exactly this.",
    risks: "SNR through thick epoxy may be marginal.",
    killCriteria: "If SNR <10 dB through 2 mm epoxy in month one, stop.",
    successCriteria: "Readable image of a known defect sample.",
  });

  // P6 — DONE. P7 — KILLED, with history.
  const p6 = addProject({
    title: "Lock-in amplifier firmware",
    description: "FPGA lock-in replacing the aging SR830s.",
    ownerId: dan,
    advisorId: prof,
    state: "DONE",
    createdAt: subDays(new Date(), 200),
    objective: "Match SR830 noise floor at 1/10 the cost.",
    howItsDoneToday: "Commercial units, $5k each, long lead times.",
    whatsNew: "Open-source FPGA stack we already use.",
    whoCares: "Every bench in the lab.",
    risks: "Firmware maintenance burden.",
    killCriteria: "If noise floor 2x worse after rev 2, stop.",
    successCriteria: "Side-by-side match on the test bench.",
  });
  db.insert(stateTransitions)
    .values({
      projectId: p6.id,
      fromState: "ACTIVE",
      toState: "DONE",
      byUserId: dan,
      reason: "Deployed on three benches.",
      createdAt: subDays(new Date(), 15),
    })
    .run();

  const p7 = addProject({
    title: "Acoustic levitation sampler",
    description: "Containerless sample handling via acoustic levitation.",
    ownerId: lena,
    advisorId: prof,
    state: "KILLED",
    createdAt: subDays(new Date(), 150),
    objective: "Hold 2 mm droplets stable for 10 minutes.",
    howItsDoneToday: "Mechanical holders that contaminate samples.",
    whatsNew: "Phased-array levitation from the maker community.",
    whoCares: "The microfluidics collaboration.",
    risks: "Stability under airflow.",
    killCriteria: "If drift >0.5 mm with enclosure, stop.",
    successCriteria: "10-minute stable hold, 3 runs.",
  });
  db.insert(stateTransitions)
    .values({
      projectId: p7.id,
      fromState: "ACTIVE",
      toState: "KILLED",
      byUserId: prof,
      reason: "Hit the kill criteria: drift 1.2 mm with enclosure. Freed Lena for the classifier.",
      createdAt: subDays(new Date(), 30),
    })
    .run();

  // Resolved blockers for the Pareto — decisions dominate, deliberately.
  const resolved = (
    projectId: string,
    causeTag: (typeof blockers.$inferInsert)["causeTag"],
    daysAgo: number,
    description: string,
    resolutionNote: string
  ): typeof blockers.$inferInsert => ({
    projectId,
    description,
    causeTag,
    ownerId: sara,
    deadline: subDays(new Date(), daysAgo - 3),
    status: "RESOLVED",
    resolutionNote,
    createdAt: subDays(new Date(), daysAgo),
    resolvedAt: subDays(new Date(), daysAgo - 4),
  });
  db.insert(blockers)
    .values([
      resolved(p1.id, "WAITING_DECISION", 70, "Which controller architecture?", "Prof picked FPGA after the one-pager."),
      resolved(p2.id, "WAITING_DECISION", 60, "SLM vendor choice pending.", "Went with Meadowlark after demo."),
      resolved(p3.id, "WAITING_DECISION", 45, "Labeling budget approval.", "Approved at monthly review."),
      resolved(p6.id, "WAITING_DECISION", 90, "Open-source license choice.", "MIT, cleared with tech transfer."),
      resolved(p1.id, "WAITING_EQUIPMENT", 50, "Accelerometer back-ordered.", "Borrowed one from mech eng."),
      resolved(p2.id, "TECHNICAL", 30, "SLM flicker at 60 Hz.", "Synced refresh to the laser trigger."),
      resolved(p6.id, "TECHNICAL", 80, "ADC clock jitter.", "External clock distribution board."),
      resolved(p3.id, "KNOWLEDGE_GAP", 40, "Nobody knew the augmentation library.", "Lena ran a lunch tutorial; notes in the FAQ."),
    ])
    .run();

  console.log("Demo lab loaded:");
  console.log("  prof@lab.local / mebar-demo   (manager)");
  console.log("  sara@lab.local, omid@lab.local, lena@lab.local, dan@lab.local / mebar-demo");
}

async function main() {
  await seedAdmin();
  if (process.argv.includes("--demo")) {
    if (process.env.NODE_ENV === "production") {
      console.error("Refusing --demo in production: it wipes all project data.");
      process.exit(1);
    }
    await seedDemo();
  }
}

main().then(() => process.exit(0));
