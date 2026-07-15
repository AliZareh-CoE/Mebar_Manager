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
  await page.click("section:has-text('Compute requests waiting') >> button:has-text('Approve')");
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
  await page.waitForTimeout(1500);
  await page.goto(BASE + "/");
  check(
    "disabled rule stops fighting",
    !(await page.textContent("body"))!.includes("Missed milestones")
  );
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
  await page.waitForTimeout(1200);
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
  await engPage.goto(BASE + "/account");
  check(
    "engineer sees their own score card",
    (await engPage.textContent("body"))!.includes("Your score (last")
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

  // 27. Nav: Settings manager-only, Data for everyone
  check("manager nav has Settings", (await page.textContent("header"))!.includes("Settings"));
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
  async function navSet(p: P): Promise<string> {
    await p.goto(BASE + "/");
    return (await p.locator("nav").first().textContent()) ?? "";
  }
  async function routeLandsOn(p: P, route: string): Promise<string> {
    await p.goto(BASE + route);
    await p.waitForLoadState("networkidle");
    return new URL(p.url()).pathname;
  }

  // Exact nav contents per persona.
  const profNav = await navSet(page);
  for (const item of ["Fight List", "Board", "Data", "Compute", "Tasks", "Initiatives", "Performance", "People", "Feedback", "Settings"]) {
    check(`matrix: prof nav has ${item}`, profNav.includes(item));
  }
  const saraNavFull = await navSet(engPage);
  for (const item of ["Fight List", "Board", "Data", "Compute", "Tasks"]) {
    check(`matrix: sara nav has ${item}`, saraNavFull.includes(item));
  }
  for (const item of ["Initiatives", "Performance", "People", "Feedback", "Settings"]) {
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

  // Route sweep: [route, prof, sara, taylor] — expected landing pathname.
  const ROUTE_MATRIX: Array<[string, string, string, string]> = [
    ["/board", "/board", "/board", "/tasks"],
    ["/data", "/data", "/data", "/tasks"],
    ["/compute", "/compute", "/compute", "/tasks"],
    ["/tasks", "/tasks", "/tasks", "/tasks"],
    ["/initiatives", "/initiatives", "/", "/"],
    ["/performance", "/performance", "/", "/"],
    ["/admin/users", "/admin/users", "/", "/"],
    ["/admin/feedback", "/admin/feedback", "/", "/"],
    ["/admin/settings", "/admin/settings", "/", "/"],
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
  await lenaPage.close();

  // 27c. v6 SWEEP — lineups, activation checkpoint, papers, underload,
  // watcher toggle. Mutations are self-restoring (swap back, toggle back)
  // or additive-once-per-seed (P8 lineup/paper — reseed wipes them).
  await page.goto(BASE + "/");
  const profFights = (await page.textContent("body"))!;
  check("v6: missing-people fight section renders", profFights.includes("Missing PI / first author"));
  check("v6: paperless fight section renders", profFights.includes("Projects without a paper"));
  check("v6: underload fight section renders", profFights.includes("Underloaded researchers"));
  check("v6: underload headline n/min format", /has \d+\/\d+ active projects/.test(profFights));
  check("v6: manager sees other researchers' underload", /Omid Rahimi has \d+\/\d+/.test(profFights));

  await engPage.goto(BASE + "/");
  const saraFights = (await engPage.textContent("body"))!;
  check("v6: engineer sees own underload item", /Sara Kim has \d+\/\d+ active projects/.test(saraFights));
  check("v6: engineer never sees others' underload", !/Omid Rahimi has \d+\/\d+/.test(saraFights));
  await engPage.goto(BASE + "/account");
  check(
    "v6: own underload item on account page",
    /Sara Kim has \d+\/\d+ active projects/.test((await engPage.textContent("body"))!)
  );

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
  await page.waitForTimeout(1200);
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
  check("v6: paper grace input renders", (await page.textContent("body"))!.includes("Paper grace (days)"));
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

  await browser.close();
  console.log(results.join("\n"));
  if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
}

main().catch((e) => {
  console.log(results.join("\n"));
  console.error(e);
  process.exit(1);
});
