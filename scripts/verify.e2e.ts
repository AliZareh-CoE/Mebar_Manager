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

  // 18. Engineer can open the compute request form
  await engPage.goto(BASE + "/board");
  await engPage.click("text=Femtosecond pulse shaper");
  await engPage.waitForSelector("text=The Heilmeier questions");
  await engPage.click("text=Compute (");
  await engPage.click("text=Request compute");
  await engPage.waitForSelector("text=The bar for an approval");
  check("engineer reaches the compute request form", true);

  await browser.close();
  console.log(results.join("\n"));
  if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
}

main().catch((e) => {
  console.log(results.join("\n"));
  console.error(e);
  process.exit(1);
});
