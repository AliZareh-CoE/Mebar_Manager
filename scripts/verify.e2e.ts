import { chromium } from "playwright-core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SHOTS_DIR ?? path.join(os.tmpdir(), "mebar-e2e");
fs.mkdirSync(SHOTS, { recursive: true });
const results: string[] = [];

function check(name: string, ok: boolean, extra = "") {
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
}

async function main() {
  // playwright-core bundles no browser: point CHROMIUM_PATH at any Chrome or
  // Chromium binary on your machine.
  const executablePath =
    process.env.CHROMIUM_PATH ??
    ["/opt/pw-browsers/chromium", "/usr/bin/chromium", "/usr/bin/google-chrome"].find((p) =>
      fs.existsSync(p)
    );
  if (!executablePath) {
    console.error("No Chromium found. Set CHROMIUM_PATH to a Chrome/Chromium binary.");
    process.exit(1);
  }
  const browser = await chromium.launch({ executablePath });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();

  // 1. Redirect to login when signed out
  await page.goto(BASE + "/");
  await page.waitForURL("**/login");
  check("logged-out / redirects to /login", page.url().includes("/login"));

  // 2. Login as manager
  await page.fill("#email", "prof@lab.local");
  await page.fill("#password", "mebar-demo");
  await page.click("button[type=submit]");
  await page.waitForURL(BASE + "/");
  check("manager login lands on Fight List", true);
  await page.waitForSelector("text=Stalled projects");

  // 3. All expected fight sections present
  const body = await page.textContent("body");
  for (const section of [
    "Stalled projects",
    "Past their revive date",
    "Overdue blockers",
    "Unowned blockers",
    "Overdue tasks",
    "Unowned tasks",
    "Overdue initiatives",
    "Unowned initiatives",
    "Decisions waiting",
    "Missed milestones",
    "What keeps blocking us",
  ]) {
    check(`section "${section}"`, body!.includes(section));
  }
  check("countdown headline shows", /auto-proceeds in \d+h/.test(body!));
  await page.screenshot({ path: SHOTS + "/01-fight-list.png", fullPage: true });

  // 4. The 3-day-old decision auto-proceeded (lazy expiry ran on load)
  await page.click("text=ML defect classifier");
  await page.waitForSelector("text=The Heilmeier questions");
  await page.click("text=Decisions (");
  await page.waitForSelector("text=Auto-proceeded");
  check("3d-old decision flipped to AUTO_PROCEEDED", true);
  await page.screenshot({ path: SHOTS + "/02-project-decisions.png", fullPage: true });

  // 5. Add update to stalled P1 → its stall item disappears
  await page.goto(BASE + "/");
  const stalledBefore = await page.locator("p", { hasText: /No update in \d+ days/ }).count();
  await page.click("section:has-text('Stalled projects') >> button:has-text('Add update')");
  await page.fill("textarea[name=whatMoved]", "Loaner piezo driver arrived; loop closed on the small stage.");
  await page.fill("textarea[name=whatsNext]", "Repeat with the cryostat cold.");
  await page.click("button:has-text('Post update')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  const stalledAfter = await page.locator("p", { hasText: /No update in \d+ days/ }).count();
  check("adding update clears the stall", stalledAfter === stalledBefore - 1, `${stalledBefore}→${stalledAfter}`);

  // 6. Decide the pending decision as manager
  await page.click("button:has-text('Decide now')");
  await page.fill("textarea[name=decisionNote]", "Buy the workstation. Approved.");
  await page.click("div[role=dialog] button:has-text('Decide')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  const decideLeft = await page.locator("button:has-text('Decide now')").count();
  check("decision decided disappears from list", decideLeft === 0, `${decideLeft} left`);

  // 7. Revive the paused project (past revive date)
  await page.click("button:has-text('Revive')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  const reviveLeft = (await page.textContent("body"))!.includes("Past their revive date");
  check("revive clears past-revive fight", !reviveLeft);

  // 8. Board renders with age pills and filters
  await page.goto(BASE + "/board");
  await page.waitForSelector("text=Femtosecond pulse shaper");
  const boardBody = await page.textContent("body");
  check("board shows state badges", boardBody!.includes("Active") && boardBody!.includes("Proposal"));
  check("board hides killed by default", !boardBody!.includes("Acoustic levitation"));
  check("age pill renders", /d since progress|today/.test(boardBody!));
  await page.screenshot({ path: SHOTS + "/03-board.png", fullPage: true });

  // 9. Engineer sees no Decide button and no People nav
  const engPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await engPage.goto(BASE + "/login");
  await engPage.fill("#email", "sara@lab.local");
  await engPage.fill("#password", "mebar-demo");
  await engPage.click("button[type=submit]");
  await engPage.waitForURL(BASE + "/");
  const engBody = await engPage.textContent("body");
  check("engineer: no People nav", !engBody!.includes("People"));
  check("engineer: no Decide button", (await engPage.locator("button:has-text('Decide now')").count()) === 0);
  await engPage.goto(BASE + "/admin/users");
  await engPage.waitForTimeout(1000);
  check("engineer: /admin/users redirects away", !engPage.url().includes("/admin/users"));

  // 10. Illegal transition buttons absent: DONE project has none
  await page.goto(BASE + "/board?state=DONE");
  await page.click("text=Lock-in amplifier firmware");
  await page.waitForSelector("text=The Heilmeier questions");
  const doneButtons = await page
    .locator("button", { hasText: /Mark blocked|Pause|Mark done|Kill project|Revive/ })
    .count();
  check("DONE project shows no transition buttons", doneButtons === 0, `${doneButtons} buttons`);

  // 11. New fight sections for data + compute
  await page.goto(BASE + "/");
  const flBody = await page.textContent("body");
  for (const section of [
    "Overdue data requests",
    "Unowned data requests",
    "Compute requests waiting",
    "Compute results owed",
  ]) {
    check(`section "${section}"`, flBody!.includes(section));
  }
  await page.screenshot({ path: SHOTS + "/04-fight-list-full.png", fullPage: true });

  // 12. /compute page: coordinator header + all four status groups
  await page.goto(BASE + "/compute");
  const computeBody = await page.textContent("body");
  check("/compute names the coordinator", computeBody!.includes("Prof. Mebar"));
  for (const group of ["Pending", "Approved", "Completed", "Denied"]) {
    check(`/compute group "${group}"`, computeBody!.includes(group));
  }
  await page.screenshot({ path: SHOTS + "/05-compute.png", fullPage: true });

  // 13. People page: analyst + coordinator badges and controls
  await page.goto(BASE + "/admin/users");
  const peopleBody = await page.textContent("body");
  check("People shows Data analyst badge", peopleBody!.includes("Data analyst"));
  check("People shows Compute coordinator badge", peopleBody!.includes("Compute coordinator"));
  check(
    "People shows analyst toggles",
    (await page.locator("button:has-text('Make analyst')").count()) > 0
  );
  check(
    "Make-coordinator offered to some manager",
    (await page.locator("button:has-text('Make compute coordinator')").count()) >= 1
  );
  check(
    "coordinator's own row has no Make-coordinator button",
    (await page
      .locator("tr", { hasText: "Prof. Mebar" })
      .locator("button:has-text('Make compute coordinator')")
      .count()) === 0
  );
  check(
    "engineer rows have no Make-coordinator button",
    (await page
      .locator("tr", { hasText: "Sara Kim" })
      .locator("button:has-text('Make compute coordinator')")
      .count()) === 0
  );

  // 14. Data flow: assign the unowned request, then deliver the overdue one
  await page.goto(BASE + "/");
  await page.click("section:has-text('Unowned data requests') >> text=Assign analyst");
  await page.click("div[role=listbox] >> text=Lena Fischer");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "assigning clears the unowned data fight",
    !(await page.textContent("body"))!.includes("Unowned data requests")
  );
  await page.click("section:has-text('Overdue data requests') >> button:has-text('Deliver')");
  await page.fill("textarea[name=deliveryNote]", "Batches on the NAS under /datasets/defects-2024; labels verified.");
  await page.click("div[role=dialog] button:has-text('Deliver')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "delivering clears the overdue data fight",
    !(await page.textContent("body"))!.includes("Overdue data requests")
  );

  // 15. Coordinator approves the pending compute request from the Fight List
  // Scope to the actions slot: the card's detail text ("Approve it or deny
  // it…") is itself a button since v11's detail dialogs.
  await page.click(
    "section:has-text('Compute requests waiting') >> [data-slot=fight-actions] >> button:has-text('Approve')"
  );
  await page.fill("textarea[name=accessInstructions]", "Brev instance mebar-ml-01; link in the vault.");
  await page.fill("input[name=windowEnd]", "2027-01-15");
  await page.click("div[role=dialog] button:has-text('Approve')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "approval clears the pending compute fight",
    !(await page.textContent("body"))!.includes("Compute requests waiting")
  );

  // 16. Requester-side results summary clears the results-owed fight
  await page.click("section:has-text('Compute results owed') >> button:has-text('Submit results')");
  await page.fill(
    "textarea[name=resultsSummary]",
    "Residuals 1.7% (target <2%). Calibration surface exported; data and checkpoints retrieved."
  );
  await page.click("div[role=dialog] button:has-text('Submit')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "results summary clears the results-owed fight",
    !(await page.textContent("body"))!.includes("Compute results owed")
  );
  await page.goto(BASE + "/compute");
  check(
    "completed request shows on /compute",
    (await page.textContent("body"))!.includes("Residuals 1.7%")
  );

  // 17. Strictness: a manager who is NOT the coordinator cannot approve
  const noaPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await noaPage.goto(BASE + "/login");
  await noaPage.fill("#email", "noa@lab.local");
  await noaPage.fill("#password", "mebar-demo");
  await noaPage.click("button[type=submit]");
  await noaPage.waitForURL(BASE + "/");
  await noaPage.goto(BASE + "/compute");
  check(
    "non-coordinator manager sees zero Approve buttons",
    (await noaPage.locator("button:has-text('Approve')").count()) === 0
  );
  check(
    "non-coordinator manager sees waiting-on text",
    (await noaPage.textContent("body"))!.includes("Waiting on the compute coordinator") ||
      (await noaPage.locator("button:has-text('Approve')").count()) === 0
  );

  // 18. Engineer can open the compute request form (own project only —
  // restricted visibility hides the rest)
  await engPage.goto(BASE + "/board");
  await engPage.click("text=Cryo-stage vibration isolation");
  await engPage.waitForSelector("text=The Heilmeier questions");
  await engPage.click("text=Compute (");
  await engPage.click("text=Request compute");
  await engPage.waitForSelector("text=The bar for an approval");
  check("engineer reaches the compute request form", true);

  // 19. Theme: dark default, toggle to light and back
  await page.goto(BASE + "/");
  check("dark theme by default", ((await page.getAttribute("html", "class")) ?? "").includes("dark"));
  await page.click("button[aria-label='Toggle theme']");
  await page.waitForTimeout(400);
  check(
    "toggle switches to light",
    ((await page.getAttribute("html", "class")) ?? "").includes("light")
  );
  await page.screenshot({ path: SHOTS + "/06-light-mode.png", fullPage: true });
  await page.click("button[aria-label='Toggle theme']");
  await page.waitForTimeout(400);
  check(
    "toggle back to dark",
    ((await page.getAttribute("html", "class")) ?? "").includes("dark")
  );

  // 20. Lab name renders from settings (seeded as "Mebar Lab")
  check("wordmark from settings", (await page.textContent("header"))!.includes("Mebar Lab"));

  // 21. /data page
  await page.goto(BASE + "/data");
  const dataBody = await page.textContent("body");
  check("/data names the analyst", dataBody!.includes("Lena Fischer"));
  check("/data shows groups", dataBody!.includes("Open") && dataBody!.includes("Delivered"));

  // 21b. External data requests — coordinators log outside asks and route
  // them to a data analyst. Seeded: one unassigned (Ada Byrne), one assigned
  // (Analog Devices → Lena).
  check("/data shows external requests to the coordinator", dataBody!.includes("External ·"));
  check("/data shows the external requester name", dataBody!.includes("Prof. Ada Byrne"));
  check(
    "/data has the coordinator's Log-external button",
    (await page.locator("button:has-text('Log external request')").count()) > 0
  );
  // Log a fresh external request through the dialog.
  await page.click("button:has-text('Log external request')");
  await page.waitForSelector("input[name=externalRequester]");
  await page.fill("input[name=externalRequester]", "MIT Media Lab (external)");
  await page.fill("input[name=externalContact]", "req@media.example");
  await page.fill("input[name=title]", "Gesture capture corpus, anonymized");
  await page.fill("textarea[name=description]", "Any shareable subset, per-session folders.");
  await page.fill("input[name=neededBy]", "2027-02-01");
  await page.click("button:has-text('Log it')");
  await page.waitForSelector("text=MIT Media Lab (external)");
  check("coordinator logged a new external request", true);
  // Route the unassigned external (Ada Byrne) to Lena via the row's assign select.
  const adaRow = page.locator("tr", { hasText: "Prof. Ada Byrne" });
  await adaRow.locator("button:has-text('Assign analyst')").click();
  await page.click("[role=option]:has-text('Lena Fischer')");
  // Condition-based: the row re-renders via RSC refresh, which can outlast a
  // fixed sleep on a cold dev server.
  await page.waitForFunction(() => {
    const row = Array.from(document.querySelectorAll("tr")).find((r) =>
      (r.textContent ?? "").includes("Prof. Ada Byrne")
    );
    return !!row && (row.textContent ?? "").includes("Lena Fischer");
  });
  check("coordinator assigned the external request to an analyst", true);

  // 22. Settings: raising the unowned grace hides the unowned-blocker fight
  await page.goto(BASE + "/admin/settings/fights");
  const thresholdForm = page.locator("form", { has: page.locator("input[name=unownedGraceDays]") });
  await thresholdForm.locator("input[name=unownedGraceDays]").fill("30");
  await thresholdForm.locator("button[type=submit]").click();
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "raised grace hides unowned blockers",
    !(await page.textContent("body"))!.includes("Unowned blockers")
  );
  await page.goto(BASE + "/admin/settings/fights");
  await thresholdForm.locator("input[name=unownedGraceDays]").fill("2");
  await thresholdForm.locator("button[type=submit]").click();
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "restored grace brings them back",
    (await page.textContent("body"))!.includes("Unowned blockers")
  );

  // 22b. Workflow editor: add a custom state → shows up on the board filter →
  // reset to stock. Self-restoring.
  await page.goto(BASE + "/admin/settings/workflow");
  await page.fill("#new-state-label", "Triage");
  await page.click("button:has-text('Add state')");
  await page.click("button:has-text('Save workflow')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/admin/settings/workflow");
  check(
    "custom state persists in the editor",
    (await page.textContent("body"))!.includes("TRIAGE")
  );
  await page.goto(BASE + "/board");
  await page.click("text=All states"); // open the state filter
  check(
    "custom state appears in the board filter",
    (await page.textContent("body"))!.includes("Triage")
  );
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/admin/settings/workflow");
  await page.click("button:has-text('Reset to stock workflow')");
  await page.click("button:has-text('Save workflow')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/admin/settings/workflow");
  check(
    "reset removes the custom state",
    !(await page.textContent("body"))!.includes("TRIAGE")
  );

  // 22c. Categories: archive a cause tag → gone from the raise-blocker select,
  // but the Pareto chart keeps showing history. Self-restoring.
  await page.goto(BASE + "/admin/settings/categories");
  const knowledgeRow = page.locator("div.rounded-md", {
    has: page.locator('input[value="Knowledge gap"]'),
  });
  await knowledgeRow.locator("button:has-text('Archive')").click();
  await page.locator("button:has-text('Save')").first().click();
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "archived tag still labels Pareto history",
    (await page.textContent("body"))!.includes("Knowledge gap")
  );
  const projHref = await page
    .goto(BASE + "/board")
    .then(() => page.locator("a", { hasText: "Cryo-stage vibration isolation" }).first().getAttribute("href"));
  await page.goto(BASE + projHref);
  await page.click("text=Blockers (");
  await page.click("button:has-text('Raise blocker')");
  // The open dialog is the only mounted form with a deadline input; its
  // first plain button is the cause select trigger.
  const raiseForm = page.locator("form", { has: page.locator("input[name=deadline]") });
  await raiseForm.locator("button[type=button]").first().click();
  check(
    "archived tag not selectable for new blockers",
    !(await page.locator("[role=listbox]").textContent())!.includes("Knowledge gap")
  );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/admin/settings/categories");
  await knowledgeRow.locator("button:has-text('Restore')").click();
  await page.locator("button:has-text('Save')").first().click();
  await page.waitForTimeout(1500);

  // 22d. Proposal questions: add a custom one → appears on the new-proposal
  // form → archive it → gone. (Reseed wipes the leftover archived row.)
  await page.goto(BASE + "/admin/settings/proposal");
  await page.fill("input[placeholder*='ethics']", "Data management plan?");
  await page.click("button:has-text('Add')");
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/projects/new");
  check(
    "custom proposal question on the form",
    (await page.textContent("body"))!.includes("Data management plan?")
  );
  await page.goto(BASE + "/admin/settings/proposal");
  const dmpRow = page.locator("div.rounded-md", {
    has: page.locator('input[value="Data management plan?"]'),
  });
  await dmpRow.locator("button:has-text('Archive')").click();
  await page.click("button:has-text('Save')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/projects/new");
  check(
    "archived question off the form",
    !(await page.textContent("body"))!.includes("Data management plan?")
  );

  // 22e. Fight rules: disable MISSED_MILESTONE (its fight persists all run)
  // → section disappears → re-enable. Self-restoring.
  await page.goto(BASE + "/admin/settings/fights");
  const milestoneRule = page.locator("div.rounded-md", {
    has: page.locator("code", { hasText: "MISSED_MILESTONE" }),
  });
  await milestoneRule.locator("input[type=checkbox]").uncheck();
  await page.click("button:has-text('Save fight rules')");
  // Condition-based: reload until the section is gone (the save + cache
  // revalidation can outlast a flat wait on a cold compile).
  let milestoneSectionGone = false;
  for (let i = 0; i < 10 && !milestoneSectionGone; i++) {
    await page.waitForTimeout(1000);
    await page.goto(BASE + "/");
    milestoneSectionGone = !(await page.textContent("body"))!.includes("Missed milestones");
  }
  check("disabled rule stops fighting", milestoneSectionGone);
  await page.goto(BASE + "/admin/settings/fights");
  await milestoneRule.locator("input[type=checkbox]").check();
  await page.click("button:has-text('Save fight rules')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "re-enabled rule fights again",
    (await page.textContent("body"))!.includes("Missed milestones")
  );

  // 23. Restricted visibility: sara sees only her project
  await engPage.goto(BASE + "/board");
  const saraBoard = await engPage.textContent("body");
  check("sara sees her own project", saraBoard!.includes("Cryo-stage vibration isolation"));
  check("sara can't see others' projects", !saraBoard!.includes("Terahertz imaging line"));
  const hiddenHref = await page
    .goto(BASE + "/board")
    .then(() => page.locator("a", { hasText: "Femtosecond pulse shaper" }).first().getAttribute("href"));
  const hiddenResp = await engPage.goto(BASE + hiddenHref);
  check("direct URL to hidden project 404s", hiddenResp?.status() === 404);

  // 24. Managers see everything; OPEN mode opens it up for everyone
  const noaPage2 = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await noaPage2.goto(BASE + "/login");
  await noaPage2.fill("#email", "noa@lab.local");
  await noaPage2.fill("#password", "mebar-demo");
  await noaPage2.click("button[type=submit]");
  await noaPage2.waitForURL(BASE + "/");
  await noaPage2.goto(BASE + "/board");
  check(
    "manager noa sees all projects",
    (await noaPage2.textContent("body"))!.includes("Terahertz imaging line")
  );
  await page.goto(BASE + "/admin/settings");
  const visForm = page.locator("form", { has: page.locator("[name=visibilityMode]") });
  await visForm.locator("button[type=button]").first().click(); // open the select
  await page.click("text=Open — everyone sees everything");
  await visForm.locator("button[type=submit]").click();
  await page.waitForTimeout(1500);
  await engPage.goto(BASE + "/board");
  check(
    "OPEN mode: sara sees everything",
    (await engPage.textContent("body"))!.includes("Terahertz imaging line")
  );
  await page.goto(BASE + "/admin/settings");
  await visForm.locator("button[type=button]").first().click();
  await page.click("text=Restricted — researchers see only their projects");
  await visForm.locator("button[type=submit]").click();
  await page.waitForTimeout(1500);
  await engPage.goto(BASE + "/board");
  check(
    "back to RESTRICTED: hidden again",
    !(await engPage.textContent("body"))!.includes("Terahertz imaging line")
  );

  // 24b. Secretary: own task list only — no projects, no board, no compute.
  const secPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await secPage.goto(BASE + "/login");
  await secPage.fill("#email", "taylor@lab.local");
  await secPage.fill("#password", "mebar-demo");
  await secPage.click("button[type=submit]");
  await secPage.waitForURL(BASE + "/");
  const secNav = await secPage.locator("nav").first().textContent();
  check("secretary nav has Tasks", secNav!.includes("Tasks"));
  check(
    "secretary nav lacks Board/Compute/Data",
    !secNav!.includes("Board") && !secNav!.includes("Compute") && !secNav!.includes("Data")
  );
  const secFightBody = await secPage.textContent("body");
  check("secretary sees their overdue task fight", secFightBody!.includes("Overdue tasks"));
  check(
    "secretary sees no project fights",
    !secFightBody!.includes("Overdue blockers") && !secFightBody!.includes("Stalled projects")
  );
  await secPage.goto(BASE + "/board");
  await secPage.waitForURL(BASE + "/tasks");
  check("secretary /board redirects to /tasks", secPage.url().endsWith("/tasks"));
  const secTasks = await secPage.textContent("body");
  check("secretary sees their assigned task", secTasks!.includes("cryostat o-ring"));
  check(
    "secretary can't see others' unowned tasks",
    !secTasks!.includes("fab partners")
  );
  // The manager's /tasks shows everything, including the unowned one.
  await page.goto(BASE + "/tasks");
  const mgrTasks = await page.textContent("body");
  check("manager sees unowned tasks too", mgrTasks!.includes("fab partners"));
  check("manager sees the secretary roster", mgrTasks!.includes("Taylor Reed"));

  // 24c. Initiatives: leadership-only surface with full CRUD round-trip.
  await page.goto(BASE + "/initiatives");
  const iniBody = await page.textContent("body");
  check("initiatives page renders groups", iniBody!.includes("Open fights") && iniBody!.includes("Won"));
  check("seeded WON initiative shows", iniBody!.includes("Second wet-lab room"));
  await page.click("button:has-text('File initiative')");
  await page.fill("input[name=title]", "E2E test initiative — new oscilloscope budget");
  await page.fill("input[name=deadline]", "2030-01-01");
  await page.click("div[role=dialog] button[type=submit]");
  await page.waitForTimeout(1500);
  check(
    "filed initiative appears",
    (await page.textContent("body"))!.includes("E2E test initiative")
  );
  const e2eIniRow = page.locator("tr", { hasText: "E2E test initiative" }).first();
  await e2eIniRow.locator("button:has-text('Cancel…')").click();
  await page.fill("div[role=dialog] textarea[name=reason]", "Test cleanup — not a real fight.");
  await page.click("div[role=dialog] button:has-text('Cancel initiative')");
  await page.waitForTimeout(1500);
  check(
    "cancelled initiative moves to Cancelled",
    (await page.textContent("body"))!.includes("Cancelled")
  );
  // Engineer sara: no nav entry, redirected away, no initiative fights.
  await engPage.goto(BASE + "/initiatives");
  await engPage.waitForURL(BASE + "/");
  check("engineer /initiatives redirects home", engPage.url() === BASE + "/");
  const saraNav = await engPage.locator("nav").first().textContent();
  check("engineer nav lacks Initiatives", !saraNav!.includes("Initiatives"));
  check(
    "engineer fight list has no initiative sections",
    !(await engPage.textContent("body"))!.includes("Overdue initiatives")
  );

  // 24d. Feedback: every role can submit via the header button; managers
  // triage at /admin/feedback. Self-restoring: we respond to our own row.
  await secPage.goto(BASE + "/tasks");
  await secPage.click("button[aria-label='Send feedback']");
  await secPage.fill("input[name=title]", "E2E feedback — task table needs sorting");
  await secPage.fill("textarea[name=body]", "Sorting by deadline would help me plan the week.");
  await secPage.click("div[role=dialog] button[type=submit]");
  await secPage.waitForTimeout(1200);
  check("secretary can submit feedback", true);
  await page.goto(BASE + "/admin/feedback");
  const fbBody = await page.textContent("body");
  check("manager sees seeded feedback groups", fbBody!.includes("New") && fbBody!.includes("Planned"));
  check("manager sees the secretary's submission", fbBody!.includes("E2E feedback"));
  const fbRow = page.locator("tr", { hasText: "E2E feedback" }).first();
  await fbRow.locator("button:has-text('Respond…')").click();
  await page.fill("div[role=dialog] textarea[name=adminResponse]", "Good idea — queued.");
  await page.click("div[role=dialog] button:has-text('Save verdict')");
  // Wait for the refreshed row, not a fixed delay — the action + refresh
  // round-trip occasionally outruns a flat timeout.
  await page
    .waitForSelector("text=Good idea — queued.", { timeout: 15000 })
    .catch(() => {});
  check(
    "manager response lands on the row",
    (await page.textContent("body"))!.includes("Good idea — queued.")
  );
  await engPage.goto(BASE + "/admin/feedback");
  await engPage.waitForURL(BASE + "/");
  check("engineer /admin/feedback redirects home", engPage.url() === BASE + "/");

  // 24e. Performance: leadership-only standings; everyone appears; own
  // score on /account; admin tab saves (self-restoring).
  await page.goto(BASE + "/performance");
  const perfBody = await page.textContent("body");
  check(
    "performance table headers render",
    perfBody!.includes("Delivery") && perfBody!.includes("Discipline") && perfBody!.includes("Initiative")
  );
  for (const name of ["Prof. Mebar", "Noa Levi", "Sara Kim", "Omid Rahimi", "Lena Fischer", "Dan Okafor", "Taylor Reed"]) {
    check(`performance lists ${name}`, perfBody!.includes(name));
  }
  await page.locator("details summary", { hasText: "Prof. Mebar" }).first().click();
  check(
    "breakdown expands with metric labels",
    (await page.textContent("body"))!.includes("Compute requests decided")
  );
  await engPage.goto(BASE + "/performance");
  await engPage.waitForURL(BASE + "/");
  check("engineer /performance redirects home", engPage.url() === BASE + "/");
  // The pointing system is completely hidden from researchers — no score
  // card even on their own account. Leadership keeps theirs.
  await engPage.goto(BASE + "/account");
  check(
    "researcher sees NO score card on their account",
    !(await engPage.textContent("body"))!.includes("Your score (last")
  );
  await page.goto(BASE + "/account");
  check(
    "admin still sees their own score card",
    (await page.textContent("body"))!.includes("Your score (last")
  );
  await page.goto(BASE + "/admin/settings/performance");
  const windowInput = page.locator("input[name=windowDays]");
  await windowInput.fill("60");
  await page.locator("button[type=submit]").first().click();
  await page.waitForTimeout(1200);
  await page.goto(BASE + "/performance");
  check(
    "window change reflects on the page",
    (await page.textContent("body"))!.includes("Last 60 days")
  );
  await page.goto(BASE + "/admin/settings/performance");
  await windowInput.fill("90");
  await page.locator("button[type=submit]").first().click();
  await page.waitForTimeout(1200);

  // 25. Cancel a blocker → its fight clears
  await page.goto(BASE + "/board?state=BLOCKED");
  await page.click("text=ML defect classifier");
  await page.waitForSelector("text=The Heilmeier questions");
  await page.click("text=Blockers (");
  await page.click("button:has-text('Cancel…')");
  await page.fill("textarea[name=reason]", "Cluster quota restored by IT — no longer blocked.");
  await page.click("div[role=dialog] button:has-text('Cancel blocker')");
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "cancelling the blocker clears its fight",
    !(await page.textContent("body"))!.includes("Unowned blockers")
  );

  // 26. Engineer submits a compute request, then withdraws it
  await engPage.goto(BASE + "/board");
  await engPage.click("text=Cryo-stage vibration isolation");
  await engPage.click("text=Compute (");
  await engPage.click("text=Request compute");
  await engPage.waitForSelector("text=The bar for an approval");
  await engPage.fill("input[name=hoursNeeded]", "8");
  await engPage.fill(
    "textarea[name=justification]",
    "Quick sweep of controller gains on recorded telemetry; success = stable gains shortlist."
  );
  await engPage.fill("input[name=datasetSize]", "2 GB telemetry");
  await engPage.fill("input[name=preprocessingNote]", "Telemetry cleaned and windowed.");
  await engPage.fill("textarea[name=dryRunEvidence]", "Ran on 5% locally in 10 minutes.");
  await engPage.fill("textarea[name=expectedResults]", "Shortlist of 3 gain configurations.");
  await engPage.click("button:has-text('Submit request')");
  await engPage.waitForTimeout(1500);
  await engPage.click("text=Compute (");
  await engPage.click("button:has-text('Withdraw…')");
  await engPage.click("div[role=dialog] button:has-text('Withdraw')");
  await engPage.waitForTimeout(1500);
  await page.goto(BASE + "/compute");
  check(
    "withdrawn request shows in /compute history",
    (await page.textContent("body"))!.includes("Withdrawn")
  );

  // 27. Nav: Settings manager-only, Data for everyone. Settings lives in the
  // admin's "More" menu since v8, so open it before reading.
  await page.goto(BASE + "/");
  await page.locator("nav button:has-text('More')").first().click();
  await page.waitForSelector("[data-slot=dropdown-menu-content]");
  check(
    "manager nav has Settings",
    ((await page.textContent("[data-slot=dropdown-menu-content]")) ?? "").includes("Settings")
  );
  await page.keyboard.press("Escape");
  check("engineer nav lacks Settings", !(await engPage.textContent("header"))!.includes("Settings"));
  check("engineer nav has Data", (await engPage.textContent("header"))!.includes("Data"));

  // 27b. ROLE-ACCESS MATRIX — the vision-and-permissions contract, per
  // persona: exact nav sets and a full route sweep (render vs redirect).
  // Personas: prof (manager+coordinator multi-hat, `page`), sara (engineer,
  // `engPage`), taylor (secretary, `secPage`), lena (engineer+analyst).
  const lenaPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await lenaPage.goto(BASE + "/login");
  await lenaPage.fill("#email", "lena@lab.local");
  await lenaPage.fill("#password", "mebar-demo");
  await lenaPage.click("button[type=submit]");
  await lenaPage.waitForURL(BASE + "/");

  type P = typeof page;
  // A persona's nav set = the inline links plus whatever its "More" menu
  // offers (leadership/admin surfaces ride there since v8's priority nav).
  async function navSet(p: P): Promise<string> {
    await p.goto(BASE + "/");
    let text = (await p.locator("nav").first().textContent()) ?? "";
    const more = p.locator("nav button:has-text('More')");
    if ((await more.count()) > 0 && (await more.first().isVisible())) {
      await more.first().click();
      await p.waitForSelector("[data-slot=dropdown-menu-content]");
      text += (await p.textContent("[data-slot=dropdown-menu-content]")) ?? "";
      await p.keyboard.press("Escape");
    }
    return text;
  }
  async function routeLandsOn(p: P, route: string): Promise<string> {
    await p.goto(BASE + route);
    await p.waitForLoadState("networkidle");
    return new URL(p.url()).pathname;
  }

  // Exact nav contents per persona.
  const profNav = await navSet(page);
  for (const item of ["Fight List", "Board", "Data", "Compute", "Tasks", "Initiatives", "Performance", "Stats", "People", "Feedback", "Settings"]) {
    check(`matrix: prof nav has ${item}`, profNav.includes(item));
  }
  const saraNavFull = await navSet(engPage);
  for (const item of ["Fight List", "Board", "Data", "Compute", "Tasks"]) {
    check(`matrix: sara nav has ${item}`, saraNavFull.includes(item));
  }
  for (const item of ["Initiatives", "Performance", "Stats", "People", "Feedback", "Settings"]) {
    check(`matrix: sara nav lacks ${item}`, !saraNavFull.includes(item));
  }
  const taylorNav = await navSet(secPage);
  check(
    "matrix: taylor nav is exactly Fight List + Tasks",
    taylorNav.includes("Fight List") &&
      taylorNav.includes("Tasks") &&
      !taylorNav.includes("Board") &&
      !taylorNav.includes("Initiatives") &&
      !taylorNav.includes("Settings")
  );
  const lenaNav = await navSet(lenaPage);
  check(
    "matrix: analyst nav = engineer nav (add-on grants no surfaces)",
    lenaNav.includes("Data") && !lenaNav.includes("Performance") && !lenaNav.includes("Settings")
  );

  // External data requests are a coordinator/analyst concern: the analyst
  // sees them on /data, a plain researcher does not, and only leadership
  // gets the Log-external button.
  await lenaPage.goto(BASE + "/data");
  const lenaData = (await lenaPage.textContent("body"))!;
  check("matrix: analyst sees external requests on /data", lenaData.includes("External ·"));
  check(
    "matrix: analyst has no Log-external button (coordinator-only)",
    (await lenaPage.locator("button:has-text('Log external request')").count()) === 0
  );
  await engPage.goto(BASE + "/data");
  const saraData = (await engPage.textContent("body"))!;
  check("matrix: plain researcher does NOT see external requests", !saraData.includes("External ·"));
  check(
    "matrix: plain researcher has no Log-external button",
    (await engPage.locator("button:has-text('Log external request')").count()) === 0
  );

  // Route sweep: [route, prof, sara, taylor] — expected landing pathname.
  const ROUTE_MATRIX: Array<[string, string, string, string]> = [
    ["/board", "/board", "/board", "/tasks"],
    ["/data", "/data", "/data", "/tasks"],
    ["/compute", "/compute", "/compute", "/tasks"],
    ["/tasks", "/tasks", "/tasks", "/tasks"],
    ["/sops", "/sops", "/sops", "/tasks"],
    ["/meeting", "/meeting", "/", "/"],
    ["/initiatives", "/initiatives", "/", "/"],
    ["/performance", "/performance", "/", "/"],
    ["/stats", "/stats", "/", "/"],
    ["/admin/users", "/admin/users", "/", "/"],
    ["/admin/feedback", "/admin/feedback", "/", "/"],
    ["/admin/settings", "/admin/settings", "/", "/"],
    ["/admin/db", "/admin/db", "/", "/"],
  ];
  for (const [route, profDest, saraDest, taylorDest] of ROUTE_MATRIX) {
    check(`matrix: prof ${route} → ${profDest}`, (await routeLandsOn(page, route)) === profDest);
    check(`matrix: sara ${route} → ${saraDest}`, (await routeLandsOn(engPage, route)) === saraDest);
    check(`matrix: taylor ${route} → ${taylorDest}`, (await routeLandsOn(secPage, route)) === taylorDest);
  }

  // Multi-hat positive checks: prof approves compute AND appears on
  // /performance AND owns the whole board (the hats compose, none lost).
  await page.goto(BASE + "/compute");
  check(
    "matrix: multi-hat prof keeps compute verdict buttons",
    (await page.textContent("body"))!.includes("Approve")
  );
  await page.goto(BASE + "/performance");
  check(
    "matrix: multi-hat prof is scored too",
    (await page.textContent("body"))!.includes("Prof. Mebar")
  );

  // The dangerous stuff is the ADMIN's alone: a MANAGER (noa) keeps the
  // leadership surfaces but is locked out of settings, users, and feedback.
  const noaMx = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await noaMx.goto(BASE + "/login");
  await noaMx.fill("#email", "noa@lab.local");
  await noaMx.fill("#password", "mebar-demo");
  await noaMx.click("button[type=submit]");
  await noaMx.waitForURL(BASE + "/");
  const noaNav = await navSet(noaMx);
  for (const item of ["Initiatives", "Performance", "Stats"]) {
    check(`matrix: manager (noa) nav has ${item}`, noaNav.includes(item));
  }
  for (const item of ["People", "Feedback", "Settings"]) {
    check(`matrix: manager (noa) nav lacks ${item}`, !noaNav.includes(item));
  }
  for (const route of ["/admin/users", "/admin/feedback", "/admin/settings", "/admin/db"]) {
    check(`matrix: manager (noa) ${route} → /`, (await routeLandsOn(noaMx, route)) === "/");
  }
  await noaMx.close();
  await lenaPage.close();

  // 27c. v6 SWEEP — lineups, activation checkpoint, papers, underload,
  // watcher toggle. Mutations are self-restoring (swap back, toggle back)
  // or additive-once-per-seed (P8 lineup/paper — reseed wipes them).
  await page.goto(BASE + "/");
  const profFights = (await page.textContent("body"))!;
  check("v6: missing-people fight section renders", profFights.includes("Missing PI / first author"));
  check("v6: paperless rule removed from fight list", !profFights.includes("Projects without a paper"));
  check("v6: underload fight section renders", profFights.includes("Underloaded researchers"));
  check("v6: underload headline n/min format", /has \d+\/\d+ running projects/.test(profFights));
  check("v6: manager sees other researchers' underload", /Omid Rahimi has \d+\/\d+/.test(profFights));
  // Data analysts are exempt from the 5-project rule (as are secretaries
  // and leadership, filtered by role) — lena must never appear.
  check("v6: data analyst exempt from underload", !/Lena Fischer has \d+\/\d+/.test(profFights));

  // v7: paper submission targets. P1's seeded DRAFTING paper has its target
  // inside the lead window → the at-risk section renders for leadership.
  check("v7: submission-at-risk fight section renders", profFights.includes("Submission targets at risk"));
  check("v7: at-risk headline names the countdown", /Submission target in \d+d — still a draft/.test(profFights));

  // v7: paper target + shortlist round-trip on P1's Papers tab (read-only).
  await page.goto(BASE + "/board");
  await page.click("text=Cryo-stage vibration isolation");
  await page.click("text=Papers (");
  await page.waitForSelector("text=Sub-hertz drift compensation");
  const papersTab = (await page.textContent("body"))!;
  check("v7: paper row shows the target date at risk", papersTab.includes("— at risk"));
  check("v7: paper row shows the shortlist", papersTab.includes("Shortlist: Review of Scientific Instruments"));
  const draftRow = page.locator("tr", { hasText: "Sub-hertz drift compensation" });
  await draftRow.locator("button:has-text('Edit')").click();
  await page.waitForSelector("input[name=targetSubmissionAt]");
  check(
    "v7: edit dialog carries the target date",
    (await page.locator("input[name=targetSubmissionAt]").inputValue()) !== ""
  );
  check(
    "v7: edit dialog carries the shortlist",
    (await page.locator("input[name=venueShortlist]").first().inputValue()).includes(
      "Review of Scientific Instruments"
    )
  );
  await page.keyboard.press("Escape");

  // v7: the target date is locked for researchers — sara's edit is rejected.
  await engPage.goto(BASE + "/board");
  await engPage.click("text=Cryo-stage vibration isolation");
  await engPage.click("text=Papers (");
  await engPage.waitForSelector("text=Sub-hertz drift compensation");
  const saraDraftRow = engPage.locator("tr", { hasText: "Sub-hertz drift compensation" });
  await saraDraftRow.locator("button:has-text('Edit')").click();
  await engPage.waitForSelector("input[name=targetSubmissionAt]");
  await engPage.fill("input[name=targetSubmissionAt]", "2027-06-01");
  await engPage.click("button:has-text('Save')");
  await engPage.waitForSelector("text=Submission target dates are locked");
  check("v7: researcher cannot move the submission target", true);
  await engPage.keyboard.press("Escape");

  // v7: the benign path — a researcher saving a TITLE-ONLY edit must not
  // trip the lock or wipe the untouched target (the dialog resubmits all
  // fields, so an unchanged date input must read as "no change").
  await saraDraftRow.locator("button:has-text('Edit')").click();
  await engPage.waitForSelector("input[name=targetSubmissionAt]");
  const titleInput = engPage.locator("input[name=title]");
  await titleInput.fill("Sub-hertz drift compensation for cryogenic stages (rev)");
  await engPage.click("button:has-text('Save')");
  await engPage.waitForSelector("text=Sub-hertz drift compensation for cryogenic stages (rev)");
  const rowAfterRename = (await engPage
    .locator("tr", { hasText: "Sub-hertz drift compensation" })
    .textContent())!;
  check("v7: researcher title-only edit keeps the target date", rowAfterRename.includes("Target:"));
  // Restore the title (still a researcher edit — target untouched again).
  const renamedRow = engPage.locator("tr", { hasText: "Sub-hertz drift compensation" });
  await renamedRow.locator("button:has-text('Edit')").click();
  await engPage.waitForSelector("input[name=title]");
  await engPage.locator("input[name=title]").fill("Sub-hertz drift compensation for cryogenic stages");
  await engPage.click("button:has-text('Save')");
  await engPage.waitForTimeout(800);

  // v7: the escape hatch — a coordinator CAN move the target (then restores
  // it, so the check is self-healing and the at-risk fight stays seeded).
  await page.goto(BASE + "/board");
  await page.click("text=Cryo-stage vibration isolation");
  await page.click("text=Papers (");
  await page.waitForSelector("text=Sub-hertz drift compensation");
  const profDraftRow = page.locator("tr", { hasText: "Sub-hertz drift compensation" });
  await profDraftRow.locator("button:has-text('Edit')").click();
  await page.waitForSelector("input[name=targetSubmissionAt]");
  const originalTarget = await page.locator("input[name=targetSubmissionAt]").inputValue();
  await page.fill("input[name=targetSubmissionAt]", "2027-03-15");
  await page.click("button:has-text('Save')");
  await page.waitForSelector("text=Target: Mar 15, 2027");
  check("v7: coordinator can move the submission target", true);
  await profDraftRow.locator("button:has-text('Edit')").click();
  await page.waitForSelector("input[name=targetSubmissionAt]");
  await page.fill("input[name=targetSubmissionAt]", originalTarget);
  await page.click("button:has-text('Save')");
  await page.waitForSelector("text=— at risk");
  check("v7: target restored after the escape-hatch check", true);

  // v7: resubmit pre-fills the next unused shortlist venue (P2's REJECTED
  // paper venue is shortlist[0] "Optica" → prefill "Optics Letters").
  await page.goto(BASE + "/board");
  await page.click("text=Femtosecond pulse shaper");
  await page.click("text=Papers (");
  await page.waitForSelector("text=Closed-loop SLM phase stabilization");
  const rejRow = page.locator("tr", { hasText: "Closed-loop SLM phase stabilization" });
  await rejRow.locator("button:has-text('Resubmit')").click();
  await page.waitForSelector("input[name=venue]");
  check(
    "v7: resubmit pre-fills the next unused shortlist venue",
    (await page.locator("input[name=venue]").inputValue()) === "Optics Letters"
  );
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/");

  await engPage.goto(BASE + "/");
  const saraFights = (await engPage.textContent("body"))!;
  check("v6: engineer sees own underload item", /Sara Kim has \d+\/\d+ running projects/.test(saraFights));
  check("v6: engineer never sees others' underload", !/Omid Rahimi has \d+\/\d+/.test(saraFights));
  await engPage.goto(BASE + "/account");
  check(
    "v6: own underload item on account page",
    /Sara Kim has \d+\/\d+ running projects/.test((await engPage.textContent("body"))!)
  );

  // v7-C7: Thesis milestones — leadership manages from People; the member
  // sees theirs read-only; overdue ones fight, persona-scoped.
  await page.goto(BASE + "/");
  const pmProfBody = (await page.textContent("body"))!;
  check("pm: overdue thesis section for leadership", pmProfBody.includes("Overdue thesis milestones"));
  check(
    "pm: overdue headline names the milestone",
    /Thesis milestone "Qualifier exam" is \d+d past due/.test(pmProfBody)
  );
  // Admin adds one for sara via the dialog (future date — silent, but visible
  // on her account; self-restoring via reseed).
  await page.goto(BASE + "/admin/users");
  const saraRow = page.locator("tr", { hasText: "Sara Kim" });
  await saraRow.locator("button[aria-label='Milestones for Sara Kim']").click();
  await page.waitForSelector("text=Thesis milestones — Sara Kim");
  await page.click("button:has-text('Thesis submission')");
  await page.waitForSelector("input[name=dueDate]");
  await page.fill("input[name=dueDate]", "2027-09-01");
  await page.click("button:has-text('Add milestone')");
  await page.waitForSelector("text=Due Sep 1, 2027");
  check("pm: admin added a milestone via the dialog", true);
  await page.keyboard.press("Escape");
  // Member (omid) sees his own read-only on /account and his fight on /.
  const pmPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await pmPage.goto(BASE + "/login");
  await pmPage.fill("#email", "omid@lab.local");
  await pmPage.fill("#password", "mebar-demo");
  await pmPage.click("button[type=submit]");
  await pmPage.waitForURL(BASE + "/");
  const omidFights = (await pmPage.textContent("body"))!;
  check(
    "pm: the member sees their own overdue milestone fight",
    /Thesis milestone "Qualifier exam" is \d+d past due/.test(omidFights)
  );
  await pmPage.goto(BASE + "/account");
  const omidAccount = (await pmPage.textContent("body"))!;
  check("pm: member sees own milestone read-only on /account", omidAccount.includes("Qualifier exam"));
  check(
    "pm: no manage affordance on /account",
    (await pmPage.locator("button:has-text('Add milestone')").count()) === 0
  );
  await pmPage.close();
  // Scoping: sara does NOT see omid's overdue milestone (hers is future).
  await engPage.goto(BASE + "/");
  const saraPmBody = (await engPage.textContent("body"))!;
  check(
    "pm: researcher does not see another's milestone",
    !saraPmBody.includes("Overdue thesis milestones")
  );

  // v7-C6: Handbook — everyone reads it (secretary included); admin edits it
  // under Settings → Handbook; researchers can't reach the settings tab.
  await page.goto(BASE + "/handbook");
  const hbBody = (await page.textContent("body"))!;
  check("handbook: renders for admin", hbBody.includes("handbook"));
  check("handbook: stock section renders", hbBody.includes("Meeting rhythm"));
  await secPage.goto(BASE + "/handbook");
  check(
    "handbook: secretary can read it",
    (await secPage.textContent("body"))!.includes("Meeting rhythm")
  );
  check(
    "handbook: secretary nav has Handbook",
    ((await secPage.locator("nav").first().textContent()) ?? "").includes("Handbook")
  );
  await engPage.goto(BASE + "/admin/settings/handbook");
  await engPage.waitForURL(BASE + "/");
  check("handbook: researcher can't reach the settings tab", engPage.url() === BASE + "/");
  await page.goto(BASE + "/admin/settings/handbook");
  check(
    "handbook: admin settings tab renders the editor",
    (await page.locator("button:has-text('Add section')").count()) === 1
  );

  // v7-C6: Onboarding — dan (the only un-onboarded seed user) sees the
  // banner, acknowledges via /welcome, and it clears. Self-restoring: the
  // reseed un-stamps dan again.
  const onbPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await onbPage.goto(BASE + "/login");
  await onbPage.fill("#email", "dan@lab.local");
  await onbPage.fill("#password", "mebar-demo");
  await onbPage.click("button[type=submit]");
  await onbPage.waitForURL(BASE + "/");
  await onbPage.waitForSelector("text=Start onboarding");
  check("onboarding: dan sees the welcome banner", true);
  // Admin sees the pending badge before dan acknowledges.
  await page.goto(BASE + "/admin/users");
  check(
    "onboarding: admin sees the pending badge",
    (await page.textContent("body"))!.includes("Onboarding pending")
  );
  await onbPage.click("text=Start onboarding");
  await onbPage.waitForURL("**/welcome");
  await onbPage.check("input[data-slot=welcome-confirm]");
  await onbPage.click("button:has-text('Acknowledge & finish')");
  await onbPage.waitForURL(BASE + "/");
  await onbPage.waitForSelector("text=Start onboarding", { state: "detached" });
  check("onboarding: banner clears after acknowledge", true);
  await page.goto(BASE + "/admin/users");
  check(
    "onboarding: pending badge clears after acknowledge",
    !(await page.textContent("body"))!.includes("Onboarding pending")
  );
  await onbPage.close();
  await page.goto(BASE + "/");

  // v7-C5: Protocols (SOPs) — leadership writes, researchers read + copy,
  // secretary is walled off. Self-restoring: the test SOP gets archived.
  await page.goto(BASE + "/sops");
  const sopBody = (await page.textContent("body"))!;
  check("sops: page renders for leadership", sopBody.includes("Protocols"));
  check("sops: seeded protocol shows", sopBody.includes("Cryostat cooldown"));
  await page.click("button:has-text('New protocol')");
  await page.waitForSelector("input[name=title]");
  await page.fill("input[name=title]", "E2E test protocol — laser alignment");
  await page.fill(
    "textarea[name=checklist]",
    "Warm up the diode\nCheck the beam height\nLock the mounts"
  );
  await page.click("button:has-text('Create')");
  await page.waitForSelector("text=E2E test protocol");
  check("sops: leadership created a protocol", true);
  await page.click("button:has-text('E2E test protocol — laser alignment')");
  await page.waitForSelector("button:has-text('Copy checklist')");
  check(
    "sops: expanded protocol shows the checklist",
    (await page.textContent("body"))!.includes("Check the beam height")
  );
  await page.click("button[aria-label='Archive E2E test protocol — laser alignment']");
  await page.waitForSelector("text=Archived");
  check("sops: test protocol archived (self-restore)", true);
  await engPage.goto(BASE + "/sops");
  const engSopBody = (await engPage.textContent("body"))!;
  check("sops: researcher sees protocol content", engSopBody.includes("Cryostat cooldown"));
  check(
    "sops: researcher has no New-protocol button",
    (await engPage.locator("button:has-text('New protocol')").count()) === 0
  );
  check(
    "sops: researcher has no Edit affordance",
    (await engPage.locator("button:has-text('Edit')").count()) === 0
  );
  await engPage.click("button:has-text('Cryostat cooldown')");
  await engPage.waitForSelector("button:has-text('Copy checklist')");
  check("sops: researcher can expand and copy", true);
  await secPage.goto(BASE + "/sops");
  await secPage.waitForURL(BASE + "/tasks");
  check("sops: secretary redirects to tasks", secPage.url() === BASE + "/tasks");
  check(
    "sops: secretary nav lacks Protocols",
    !((await secPage.locator("nav").first().textContent()) ?? "").includes("Protocols")
  );

  // v7-C4: Meeting mode — leadership-only agenda, five stable sections.
  await page.goto(BASE + "/meeting");
  check("meeting: leader loads /meeting", new URL(page.url()).pathname === "/meeting");
  const meetingBody = (await page.textContent("body"))!;
  for (const heading of [
    "Fight list for review",
    "Updates this week",
    "Decisions to make",
    "Papers that moved",
    "Open initiatives",
  ]) {
    check(`meeting: section "${heading}"`, meetingBody.includes(heading));
  }
  check("meeting: leader nav has Meeting", (await navSet(page)).includes("Meeting"));
  await engPage.goto(BASE + "/meeting");
  await engPage.waitForURL(BASE + "/");
  check("meeting: researcher redirects home", engPage.url() === BASE + "/");
  check("meeting: researcher nav lacks Meeting", !(await navSet(engPage)).includes("Meeting"));
  await engPage.goto(BASE + "/account");

  // v7: weekly digest — self-service opt-out toggle round-trips and restores.
  await engPage.waitForSelector("input[data-slot=digest-toggle]");
  const digestWasChecked = await engPage.isChecked("input[data-slot=digest-toggle]");
  await engPage.click("input[data-slot=digest-toggle]");
  await engPage.waitForTimeout(800);
  await engPage.reload();
  await engPage.waitForSelector("input[data-slot=digest-toggle]");
  check(
    "v7: digest opt-out persists",
    (await engPage.isChecked("input[data-slot=digest-toggle]")) === !digestWasChecked
  );
  await engPage.click("input[data-slot=digest-toggle]");
  await engPage.waitForTimeout(800);
  await engPage.reload();
  await engPage.waitForSelector("input[data-slot=digest-toggle]");
  check(
    "v7: digest toggle restored",
    (await engPage.isChecked("input[data-slot=digest-toggle]")) === digestWasChecked
  );

  // v7: the admin kill switch renders in General settings.
  await page.goto(BASE + "/admin/settings");
  check(
    "v7: General settings shows the weekly-digest switch",
    (await page.textContent("body"))!.includes("Weekly digest")
  );
  await page.goto(BASE + "/");

  // v7: the digest trigger endpoint fails closed without the bearer token…
  const noAuth = await fetch(BASE + "/api/digest", { method: "POST" });
  check("v7: /api/digest rejects unauthenticated calls", noAuth.status === 401);
  // …and with the right token it runs its gates (no SMTP in CI → sent 0).
  if (process.env.CRON_SECRET) {
    const authed = await fetch(BASE + "/api/digest", {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    const body = (await authed.json()) as { sent: number; skipped?: string };
    check("v7: /api/digest accepts the cron token and reports its gates", authed.status === 200 && body.sent === 0);
  }

  // Engineer owner sees no activation button at all (leadership-only).
  const danV6 = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await danV6.goto(BASE + "/login");
  await danV6.fill("#email", "dan@lab.local");
  await danV6.fill("#password", "mebar-demo");
  await danV6.click("button[type=submit]");
  await danV6.waitForURL(BASE + "/");
  await danV6.goto(BASE + "/board?state=SCOPING");
  await danV6.click("text=Terahertz waveguide mapper");
  await danV6.waitForSelector("text=The Heilmeier questions");
  check(
    "v6: engineer owner has no Start button (leadership activates)",
    (await danV6.locator("button:has-text('Start project')").count()) === 0
  );
  await danV6.close();

  // Leadership hits the lineup gate, completes the lineup, then activates.
  await page.goto(BASE + "/board?state=SCOPING");
  await page.click("text=Terahertz waveguide mapper");
  await page.waitForSelector("text=The Heilmeier questions");
  check("v6: header shows missing-PI hint", (await page.textContent("body"))!.includes("no PI set"));
  await page.click("button:has-text('Start project')");
  await page.waitForSelector("text=needs a PI and a first author");
  check("v6: activation blocked without lineup", true);
  await page.keyboard.press("Escape");

  await page.click("text=People (");
  await page.click("button:has-text('Add person')");
  await page.click("div[role=dialog] >> text=External person");
  await page.fill("div[role=dialog] input[name=externalName]", "Dr. Elena Vasquez");
  await page.fill("div[role=dialog] input[name=affiliation]", "External PI — UNAM");
  await page.click("div[role=dialog] button[type=submit]");
  await page.waitForSelector("tr:has-text('Dr. Elena Vasquez')");
  await page.locator("tr", { hasText: "Dr. Elena Vasquez" }).locator("button:has-text('Make PI')").click();
  await page.waitForTimeout(1200);
  await page.click("button:has-text('Add person')");
  await page.click("div[role=dialog] >> text=External person");
  await page.fill("div[role=dialog] input[name=externalName]", "Tomas Berg");
  await page.fill("div[role=dialog] input[name=affiliation]", "PhD student");
  await page.click("div[role=dialog] button[type=submit]");
  await page.waitForSelector("tr:has-text('Tomas Berg')");
  await page
    .locator("tr", { hasText: "Tomas Berg" })
    .locator("button:has-text('Make first author')")
    .click();
  await page.waitForTimeout(1200);
  check(
    "v6: lineup complete clears the header hint",
    !(await page.textContent("body"))!.includes("no PI set")
  );
  await page.click("button:has-text('Start project')");
  await page.waitForTimeout(1500);
  check(
    "v6: activation succeeds once lineup is set",
    (await page.textContent("body"))!.includes("Active")
  );

  // Papers: file a draft on P8, then submit it — header chip follows.
  check("v6: paperless empty state", (await page.textContent("body"))!.includes("no paper yet"));
  await page.click("text=Papers (");
  await page.click("button:has-text('File paper')");
  await page.fill("div[role=dialog] input[name=title]", "THz near-field mode atlas");
  await page.fill("div[role=dialog] input[name=venue]", "APL Photonics");
  await page.click("div[role=dialog] button[type=submit]");
  await page.waitForSelector("tr:has-text('THz near-field mode atlas')");
  check("v6: draft chip on header", (await page.textContent("body"))!.includes("Paper: Drafting"));
  await page.locator("tr", { hasText: "THz near-field" }).locator("button:has-text('Submit…')").click();
  await page.click("div[role=dialog] button:has-text('Mark submitted')");
  await page.waitForTimeout(1200);
  check(
    "v6: submitted chip on header",
    (await page.textContent("body"))!.includes("Paper: Submitted — APL Photonics")
  );

  // People swap semantics on P1: promoting Maya demotes prof to contributor;
  // swap back to restore the seed lineup.
  await page.goto(BASE + "/board");
  await page.click("text=Cryo-stage vibration isolation");
  await page.waitForSelector("text=The Heilmeier questions");
  await page.click("text=People (");
  await page.waitForSelector("tr:has-text('Maya Chen')");
  await page.locator("tr", { hasText: "Maya Chen" }).locator("button:has-text('Make PI')").click();
  // Wait for the swap to render (Prof's row regrows a Make PI button once
  // demoted) instead of a flat delay.
  await page
    .waitForSelector("tr:has-text('Prof. Mebar') >> button:has-text('Make PI')", {
      timeout: 15000,
    })
    .catch(() => {});
  const swapped = (await page.textContent("body"))!;
  check(
    "v6: swap demotes, never ejects",
    swapped.includes("Maya Chen") && swapped.includes("Prof. Mebar")
  );
  check(
    "v6: previous PI is now a contributor",
    (await page.locator("tr", { hasText: "Prof. Mebar" }).locator("button:has-text('Make PI')").count()) === 1
  );
  await page.locator("tr", { hasText: "Prof. Mebar" }).locator("button:has-text('Make PI')").click();
  await page.waitForTimeout(1200);
  check("v6: swap back restores the lineup", true);

  // Watcher toggle round-trip on Maya (seeded notify=on).
  await page.locator("tr", { hasText: "Maya Chen" }).getByRole("button", { name: "Toggle notifications" }).click();
  await page.waitForSelector("text=Notifications off.");
  await page.waitForTimeout(1200);
  await page.locator("tr", { hasText: "Maya Chen" }).getByRole("button", { name: "Toggle notifications" }).click();
  await page.waitForSelector("text=big project events");
  check("v6: watcher toggle round-trips", true);

  // Performance: paper metrics visible in omid's breakdown.
  await page.goto(BASE + "/performance");
  await page.click("text=Omid Rahimi");
  await page.waitForTimeout(500);
  const v6Perf = (await page.textContent("body"))!;
  check("v6: papers-submitted metric in breakdown", v6Perf.includes("Papers submitted"));
  check("v6: papers-accepted metric in breakdown", v6Perf.includes("Papers accepted"));

  // Settings: the two new thresholds render; minActiveProjects 0 disables
  // the underload rule (self-restoring: back to 5).
  await page.goto(BASE + "/admin/settings/fights");
  check("v8: paper-grace input removed", !(await page.textContent("body"))!.includes("Paper grace (days)"));
  const v6Form = page.locator("form", { has: page.locator("input[name=minActiveProjects]") });
  check(
    "v6: min-active-projects input renders",
    (await page.locator("input[name=minActiveProjects]").count()) === 1
  );
  await v6Form.locator("input[name=minActiveProjects]").fill("0");
  await v6Form.locator("button[type=submit]").click();
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "v6: minActiveProjects 0 silences the underload section",
    !(await page.textContent("body"))!.includes("Underloaded researchers")
  );
  await page.goto(BASE + "/admin/settings/fights");
  await v6Form.locator("input[name=minActiveProjects]").fill("5");
  await v6Form.locator("button[type=submit]").click();
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "v6: restoring the threshold brings the section back",
    (await page.textContent("body"))!.includes("Underloaded researchers")
  );

  // 27e. ANTI-MANIPULATION LOCKS — scoring inputs are immutable for
  // researchers: no lineup changes after activation, no date pushing, no
  // self-confirmed acceptances.
  await engPage.goto(BASE + "/board");
  await engPage.click("text=Cryo-stage vibration isolation");
  await engPage.waitForSelector("text=The Heilmeier questions");
  await engPage.click("text=People (");
  await engPage.waitForSelector("text=Maya Chen");
  check(
    "lock: engineer sees no Make PI on an activated project",
    (await engPage.locator("button:has-text('Make PI')").count()) === 0
  );
  await engPage.click("text=Papers (");
  await engPage.waitForSelector("text=Active vibration cancellation");
  check(
    "lock: engineer cannot self-confirm an acceptance",
    (await engPage.locator("button:has-text('Accepted 🎉')").count()) === 0
  );
  await engPage.goto(BASE + "/");
  const saraLockBody = (await engPage.textContent("body"))!;
  check(
    "lock: engineer sees Mark done but no Push date on her missed milestone",
    saraLockBody.includes("Mark done") && !saraLockBody.includes("Push date")
  );
  // The admin keeps all three affordances.
  await page.goto(BASE + "/board");
  await page.click("text=Cryo-stage vibration isolation");
  await page.waitForSelector("text=The Heilmeier questions");
  await page.click("text=People (");
  await page.waitForSelector("text=Maya Chen");
  check(
    "lock: admin keeps Make PI on activated projects",
    (await page.locator("button:has-text('Make PI')").count()) > 0
  );
  await page.click("text=Papers (");
  await page.waitForSelector("text=Active vibration cancellation");
  check(
    "lock: admin keeps the acceptance button",
    (await page.locator("button:has-text('Accepted 🎉')").count()) === 1
  );
  // Completion gate: P1's paper is SUBMITTED, not accepted — Done is blocked
  // for everyone, admin included. State must stay Active.
  await page.click("button:has-text('Mark done')");
  await page.waitForSelector("text=no accepted paper, no Done");
  check("lock: Done is blocked until the paper is accepted", true);

  // 27f. GUIDE + INFO HINTS — every mechanism explains itself, with the
  // lab's LIVE numbers. Threshold change is self-restoring.
  await page.goto(BASE + "/");
  check(
    "guide: nav link for admin",
    ((await page.locator("nav").first().textContent()) ?? "").includes("Guide")
  );
  await page.goto(BASE + "/guide");
  const guideBody = (await page.textContent("body"))!;
  for (const section of ["The Fight List", "The project lifecycle", "How to win"]) {
    check(`guide: renders "${section}"`, guideBody.includes(section));
  }
  check("guide: playbook coaching present", guideBody.includes("Stagger the stages"));
  check("guide: further reading present", guideBody.includes("You and Your Research"));
  // v8 hotfix: the guide is a shared document — scoring is out for EVERY
  // viewer (admin included), and so is the settings/config framing.
  check("v8: no Scoring section even for the admin", !guideBody.includes("Points each"));
  check("v8: no points mentions for the admin", !/\bpoints?\b/i.test(guideBody));
  check("v8: settings/config framing gone", !guideBody.includes("live configuration"));

  // Live numbers: the guide reflects the CURRENT stallDays, and follows a change.
  await page.goto(BASE + "/admin/settings/fights");
  const stallInput = page.locator("input[name=stallDays]");
  const stallBefore = await stallInput.inputValue();
  check(
    "guide: shows the live stall threshold",
    guideBody.includes(`${stallBefore} days`)
  );
  const thresholdsForm = page.locator("form", { has: page.locator("input[name=stallDays]") });
  await thresholdsForm.locator("input[name=stallDays]").fill("43");
  await thresholdsForm.locator("button[type=submit]").click();
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/guide");
  check(
    "guide: follows a threshold change instantly",
    (await page.textContent("body"))!.includes("43 days")
  );
  await page.goto(BASE + "/admin/settings/fights");
  await thresholdsForm.locator("input[name=stallDays]").fill(stallBefore);
  await thresholdsForm.locator("button[type=submit]").click();
  await page.waitForTimeout(1500);

  // Everyone gets the guide — researcher and secretary included — but the
  // pointing system is leadership-only: no Scoring section, no weights.
  check(
    "guide: researcher nav has Guide",
    ((await engPage.locator("nav").first().textContent()) ?? "").includes("Guide")
  );
  await engPage.goto(BASE + "/guide");
  const engGuide = (await engPage.textContent("body"))!;
  check("guide: researcher can read it", engGuide.includes("The Fight List"));
  check("guide: researcher sees no Scoring section", !engGuide.includes("Points each"));
  check("guide: researcher sees no point values in copy", !/\bpoints?\b/i.test(engGuide));
  check(
    "guide: secretary nav has Guide",
    ((await secPage.locator("nav").first().textContent()) ?? "").includes("Guide")
  );
  await secPage.goto(BASE + "/guide");
  const secGuide = (await secPage.textContent("body"))!;
  check("guide: secretary can read it", secGuide.includes("The Fight List"));
  check("guide: secretary sees no Scoring section", !secGuide.includes("Points each"));

  // Info hints: fight cards carry them; clicking one opens the explanation.
  await page.goto(BASE + "/");
  const hintCount = await page.locator("[data-slot=info-hint-trigger]").count();
  check("hints: fight cards have info hints", hintCount > 0, `${hintCount} triggers`);
  await page.locator("[data-slot=info-hint-trigger]").first().click();
  await page.waitForSelector("text=Why is this here?");
  check("hints: clicking opens the why/clear/win explanation", true);
  await page.keyboard.press("Escape");
  await page.goto(BASE + "/board");
  await page.click("text=Cryo-stage vibration isolation");
  await page.waitForSelector("text=The Heilmeier questions");
  check(
    "hints: project page carries info hints",
    (await page.locator("[data-slot=info-hint-trigger]").count()) > 0
  );

  // 28. Password change (dan) + manager reset (omid)
  const danPage = await (await browser.newContext({ viewport: { width: 1440, height: 1000 } })).newPage();
  await danPage.goto(BASE + "/login");
  await danPage.fill("#email", "dan@lab.local");
  await danPage.fill("#password", "mebar-demo");
  await danPage.click("button[type=submit]");
  await danPage.waitForURL(BASE + "/");
  await danPage.goto(BASE + "/account");
  await danPage.fill("input[name=currentPassword]", "mebar-demo");
  await danPage.fill("input[name=newPassword]", "fresh-password-1");
  await danPage.fill("input[name=confirm]", "fresh-password-1");
  await danPage.click("button:has-text('Change password')");
  await danPage.waitForTimeout(1500);
  const danOld = await (await browser.newContext()).newPage();
  await danOld.goto(BASE + "/login");
  await danOld.fill("#email", "dan@lab.local");
  await danOld.fill("#password", "mebar-demo");
  await danOld.click("button[type=submit]");
  await danOld.waitForTimeout(1200);
  check("old password rejected after change", danOld.url().includes("/login"));
  await danOld.fill("#password", "fresh-password-1");
  await danOld.click("button[type=submit]");
  await danOld.waitForURL(BASE + "/");
  check("new password works", true);

  await page.goto(BASE + "/admin/users");
  await page.click("button[aria-label='Manage Omid Rahimi']");
  await page.click("text=Reset password");
  await page.click("div[role=dialog] button:has-text('Reset password')");
  await page.waitForSelector("div[role=dialog] code");
  const tempPassword = (await page.textContent("div[role=dialog] code"))!.trim();
  check("temp password displayed once", tempPassword.length >= 12);
  const omidPage = await (await browser.newContext()).newPage();
  await omidPage.goto(BASE + "/login");
  await omidPage.fill("#email", "omid@lab.local");
  await omidPage.fill("#password", tempPassword);
  await omidPage.click("button[type=submit]");
  await omidPage.waitForURL(BASE + "/");
  check("temp password signs omid in", true);

  // 29. v7: admin audit log. Earlier steps already wrote settings.* rows
  // (fight-rule saves) and project.transition rows, but re-save the Lab
  // identity form unchanged so the block stands on its own. Append-only +
  // reseed-cleared, so every check is existence-based and survives reruns.
  await page.goto(BASE + "/admin/settings");
  await page.locator("button:has-text('Save')").first().click();
  await page.waitForSelector("text=Settings saved.");
  await page.goto(BASE + "/admin/audit");
  await page.waitForSelector("text=Audit log");
  const auditBody = (await page.textContent("body"))!;
  check("audit: settings save recorded", auditBody.includes("settings."));
  check("audit: project transition recorded", auditBody.includes("project.transition"));
  await page.goto(BASE + "/admin/audit?action=settings");
  await page.waitForSelector("text=Audit log");
  const auditFiltered = (await page.textContent("body"))!;
  check("audit: filter keeps settings rows", auditFiltered.includes("settings."));
  check("audit: filter drops transition rows", !auditFiltered.includes("project.transition"));
  await page.screenshot({ path: SHOTS + "/07-admin-audit.png", fullPage: true });
  await engPage.goto(BASE + "/admin/audit");
  await engPage.waitForURL((u) => !u.pathname.startsWith("/admin/audit"));
  check("audit: researcher redirected away", !engPage.url().includes("/admin/audit"));

  // 29b. v9: UTF students — roster on the admin People page, tagging on a
  // project lineup. Reseed restores the roster, so adding is rerun-safe.
  await page.goto(BASE + "/admin/users");
  await page.waitForSelector("text=UTF students");
  check(
    "utf: roster card renders with seeded students",
    (await page.textContent("body"))!.includes("Lily Okafor")
  );
  await page.fill("input[aria-label='New UTF student name']", "Test Student");
  await page.click("button:has-text('Add student')");
  await page.waitForSelector("text=Test Student");
  check("utf: roster add round-trips", true);

  await page.goto(BASE + "/board");
  await page.click("text=Cryo-stage vibration isolation");
  await page.waitForSelector("text=The Heilmeier questions");
  await page.click("text=People (");
  // Tab panels mount on selection — wait for the lineup before reading it.
  await page.waitForSelector("text=Arman Farhadi");
  check(
    "utf: seeded tag renders with badge",
    (await page.locator("tr", { hasText: "Arman Farhadi" }).locator("text=UTF student").count()) > 0
  );
  await page.click("button:has-text('Add UTF student')");
  await page.waitForSelector("div[role=dialog]");
  await page.click("div[role=dialog] button:has-text('Add')");
  await page.waitForSelector("tr:has-text('Test Student')");
  check("utf: tagging from the roster works", true);
  const utfRow = page.locator("tr", { hasText: "Test Student" });
  check(
    "utf: no Make PI on a UTF row",
    (await utfRow.locator("button:has-text('Make PI')").count()) === 0
  );

  await page.goto(BASE + "/guide");
  check(
    "guide: further-reading uses the archived Pacheco-Vega link",
    (await page.locator("a[href*='web.archive.org']").count()) > 0
  );

  // 29c. v9: /stats — the leadership dashboard renders every question
  // section with live data (seeded UTF tags included) and at least one
  // chart; access is covered by the ROUTE_MATRIX /stats row.
  await page.goto(BASE + "/stats");
  await page.waitForSelector("text=Lab statistics");
  const statsBody = (await page.textContent("body"))!;
  for (const section of [
    "Portfolio",
    "Papers",
    "Throughput",
    "Where work gets stuck",
    "Internal services",
    "Member contributions",
    "UTF student contributions",
  ]) {
    check(`stats: renders "${section}"`, statsBody.includes(section));
  }
  check("stats: UTF rollup lists Lily Okafor", statsBody.includes("Lily Okafor"));
  check(
    "stats: charts render",
    (await page.locator(".recharts-surface, svg.recharts-surface").count()) > 0 ||
      (await page.locator("[data-chart]").count()) > 0
  );
  check("stats: no points language", !/\bpoints?\b/i.test(statsBody));

  // 29d. v9: report exports — printable views render, Word/CSV endpoints
  // stream files for leadership, and a researcher is refused the lab docx.
  await page.goto(BASE + "/stats/report");
  await page.waitForSelector("text=Lab report");
  const labReportBody = (await page.textContent("body"))!;
  check("report: lab print view renders Outputs", labReportBody.includes("Outputs"));
  check("report: lab print view renders Personnel", labReportBody.includes("Personnel"));

  await page.goto(BASE + "/board");
  await page.click("text=Cryo-stage vibration isolation");
  await page.waitForSelector("text=The Heilmeier questions");
  await page.click("a:has-text('Report'), button:has-text('Report')");
  await page.waitForURL(/\/projects\/.+\/report/);
  const projReportBody = (await page.textContent("body"))!;
  check("report: project print view renders Lineup", projReportBody.includes("Lineup"));
  check("report: project print view renders History", projReportBody.includes("History"));

  const labDocx = await page.request.get(BASE + "/api/reports/lab");
  check(
    "report: lab docx downloads for leadership",
    labDocx.status() === 200 &&
      (labDocx.headers()["content-disposition"] ?? "").includes(".docx")
  );
  const membersCsv = await page.request.get(BASE + "/api/reports/csv?entity=members");
  check(
    "report: members csv downloads",
    membersCsv.status() === 200 && (await membersCsv.text()).includes("Running owned")
  );
  const forbidden = await engPage.request.get(BASE + "/api/reports/lab");
  check("report: researcher refused the lab docx", forbidden.status() === 403);

  // 29e. v10: search bars — URL-synced, debounced, server-filtered.
  await page.goto(BASE + "/board");
  await page.waitForSelector("text=Cryo-stage vibration isolation");
  await page.fill("input[aria-label='Search projects…']", "Cryo");
  await page.waitForFunction(() => window.location.search.includes("q=Cryo"));
  await page.waitForFunction(
    () => !document.body.innerText.includes("Terahertz waveguide mapper")
  );
  await page.waitForSelector("text=Cryo-stage vibration isolation");
  check("search: board narrows to the match", true);
  await page.fill("input[aria-label='Search projects…']", "");
  await page.waitForFunction(() => !window.location.search.includes("q="));

  await page.goto(BASE + "/admin/users");
  await page.fill("input[aria-label='Search people…']", "omid");
  await page.waitForFunction(() => window.location.search.includes("q=omid"));
  await page.waitForFunction(() => !document.body.innerText.includes("Sara Kim"));
  await page.waitForSelector("text=Omid Rahimi");
  check("search: people narrows", true);

  await page.goto(BASE + "/admin/audit");
  await page.waitForSelector("text=Audit log");
  await page.fill("input[aria-label='Search the log…']", "thresholds");
  await page.waitForFunction(() => window.location.search.includes("q=thresholds"));
  await page.waitForFunction(
    () => !document.body.innerText.includes("project.transition")
  );
  await page.waitForSelector("text=settings.thresholds");
  check("search: audit log narrows", true);

  // 29f. v10: per-state points input in the workflow editor (admin-only).
  await page.goto(BASE + "/admin/settings/workflow");
  await page.waitForSelector("text=Points on reaching");
  check(
    "workflow: per-state points input renders",
    (await page.locator("input[id^='points-']").count()) > 0
  );
  const wfBody = (await page.textContent("body"))!;
  check(
    "workflow: Active-state toggle labeled plainly, active badge shown",
    wfBody.includes("Active state") && wfBody.includes("active")
  );

  // 29g. v11: detail dialogs — truncated table cells open a read-only modal
  // with the full record, so long text is never lost to an ellipsis.
  await page.goto(BASE + "/data");
  await page.click("button:has-text('2024 wafer defect micrographs')");
  await page.waitForSelector("div[role=dialog]");
  const dataDetail = (await page.textContent("div[role=dialog]"))!;
  check("detail: /data dialog shows the full description", dataDetail.includes("one folder per class"));
  check("detail: /data dialog shows the meta fields", dataDetail.includes("Needed by") && dataDetail.includes("Requested by"));
  await page.keyboard.press("Escape");
  await page.waitForSelector("[data-slot=dialog-content]", { state: "detached" });

  await page.goto(BASE + "/tasks");
  await page.click("button:has-text('Order cryostat o-ring set')");
  await page.waitForSelector("div[role=dialog]");
  const taskDetail = (await page.textContent("div[role=dialog]"))!;
  check("detail: /tasks dialog shows the full details", taskDetail.includes("PO template is in the lab vault"));
  check("detail: /tasks dialog names the filer", taskDetail.includes("Filed by"));
  await page.keyboard.press("Escape");
  await page.waitForSelector("[data-slot=dialog-content]", { state: "detached" });

  await page.goto(BASE + "/");
  const fightDetailTriggers = page.locator("main button.line-clamp-2");
  check("detail: fight cards expose detail triggers", (await fightDetailTriggers.count()) > 0);
  await fightDetailTriggers.first().click();
  await page.waitForSelector("div[role=dialog]");
  check(
    "detail: fight dialog shows age + full detail",
    ((await page.textContent("div[role=dialog]")) ?? "").includes("Sitting still for")
  );
  await page.keyboard.press("Escape");
  await page.waitForSelector("[data-slot=dialog-content]", { state: "detached" });

  // 30. v8: responsive nav. On a phone the inline link row hides and a
  // hamburger menu takes over (with the fight badge and an Account item);
  // on desktop the researcher's short link set stays inline.
  const mobilePage = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await mobilePage.goto(BASE + "/login");
  await mobilePage.fill("#email", "prof@lab.local");
  await mobilePage.fill("#password", "mebar-demo");
  await mobilePage.click("button[type=submit]");
  await mobilePage.waitForURL(BASE + "/");
  check(
    "mobile: hamburger visible",
    await mobilePage.locator("button[aria-label='Open navigation']").isVisible()
  );
  check(
    "mobile: inline Board link hidden",
    !(await mobilePage.locator("header nav a:has-text('Board')").isVisible())
  );
  const triggerText =
    (await mobilePage.locator("button[aria-label='Open navigation']").textContent()) ?? "";
  check("mobile: fight badge on the trigger", /\d/.test(triggerText));
  await mobilePage.locator("button[aria-label='Open navigation']").click();
  await mobilePage.waitForSelector("[data-slot=dropdown-menu-content]");
  const menuText =
    (await mobilePage.textContent("[data-slot=dropdown-menu-content]")) ?? "";
  check("mobile: menu lists admin links", menuText.includes("Settings"));
  check("mobile: menu has an Account item", menuText.includes("Account"));
  await mobilePage
    .locator("[data-slot=dropdown-menu-content] a:has-text('Board')")
    .click();
  await mobilePage.waitForURL(BASE + "/board");
  check("mobile: menu item navigates", true);
  await mobilePage.screenshot({ path: SHOTS + "/09-mobile-board.png", fullPage: false });
  check(
    "desktop: researcher inline nav visible at 1440",
    await engPage.locator("header nav a:has-text('Guide')").isVisible()
  );

  // 31. v12: admin god-mode — direct state override + the /admin/db editor.
  // (a) A DONE project has no legal transitions, but the admin sets any
  // state directly; the move lands in the audit log as an override.
  await page.goto(BASE + "/board?state=DONE");
  await page.click("text=Lock-in amplifier firmware");
  await page.waitForSelector("text=The Heilmeier questions");
  await page.click("button:has-text('Set state (admin)')");
  await page.waitForSelector("div[role=dialog]");
  await page.click("div[role=dialog] [data-slot=select-trigger]");
  await page.click("[role=option]:has-text('Scoping')");
  await page.fill(
    "div[role=dialog] textarea[name=reason]",
    "Override drill — reopening for a follow-up study."
  );
  await page.click("div[role=dialog] button:has-text('Set state')");
  await page.waitForSelector("[data-slot=dialog-content]", { state: "detached" });
  // The select trigger already reads "Scoping" pre-submit, so wait on the
  // header badge (h1's flex row), not the whole body.
  await page.waitForFunction(() => {
    const h1 = document.querySelector("h1");
    return !!h1?.parentElement?.innerText.includes("Scoping");
  });
  check("override: DONE project set to Scoping directly", true);
  await page.goto(BASE + "/admin/audit");
  await page.waitForSelector("text=Audit log");
  check(
    "override: audit log records the admin override",
    (await page.textContent("body"))!.includes("(admin override)")
  );

  // (b) /admin/db: Django-style editor — every table, full CRUD, admin only.
  await page.goto(BASE + "/admin/db");
  await page.waitForSelector("text=Database");
  const dbBody = (await page.textContent("body"))!;
  check(
    "admin/db: lists tables with counts",
    dbBody.includes("projects") && dbBody.includes("utf_students") && dbBody.includes("user")
  );
  await page.goto(BASE + "/admin/db/utf_students");
  await page.waitForSelector("button:has-text('Add row')");
  await page.click("button:has-text('Add row')");
  await page.fill("div[role=dialog] textarea[name=name]", "E2E Robot");
  await page.click("div[role=dialog] button:has-text('Insert')");
  await page.waitForFunction(() => document.body.innerText.includes("E2E Robot"));
  check("admin/db: insert works (blank id/createdAt use defaults)", true);
  await page
    .locator("tr", { hasText: "E2E Robot" })
    .locator("button:has-text('Edit')")
    .click();
  await page.fill("div[role=dialog] textarea[name=name]", "E2E Robot Mk2");
  await page.click("div[role=dialog] button:has-text('Save')");
  await page.waitForFunction(() => document.body.innerText.includes("E2E Robot Mk2"));
  check("admin/db: edit works", true);
  await page
    .locator("tr", { hasText: "E2E Robot Mk2" })
    .locator("button:has-text('Delete')")
    .click();
  await page.click("div[role=dialog] button:has-text('Delete row')");
  await page.waitForFunction(() => !document.body.innerText.includes("E2E Robot"));
  check("admin/db: delete works", true);

  await browser.close();
  console.log(results.join("\n"));
  if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
}

main().catch((e) => {
  console.log(results.join("\n"));
  console.error(e);
  process.exit(1);
});
