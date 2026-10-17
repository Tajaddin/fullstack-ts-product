import { expect, test, type Page } from "@playwright/test";
import { cleanupUsers, signInAs, unique } from "./helpers";

const owner = { email: `${unique("owner")}@example.edu`, name: "Olive Owner", role: "member" as const };
const member = { email: `${unique("member")}@example.edu`, name: "Max Member", role: "member" as const };
const mod = { email: `${unique("mod")}@example.edu`, name: "Mia Moderator", role: "moderator" as const };

test.afterAll(async () => {
  await cleanupUsers([owner.email, member.email, mod.email]);
});

async function createGroup(page: Page, name: string): Promise<string> {
  await page.goto("/groups/new?course=COP4530");
  await page.getByLabel("Group name").fill(name);
  await page.getByLabel("What the group is about").fill("Weekly problem sets, bring questions.");
  await page.getByLabel("Capacity").fill("3");
  await page.getByRole("button", { name: "Create group" }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  const url = page.url();
  return url.slice(url.lastIndexOf("/") + 1);
}

test("owner creates a group and schedules a meetup; a member joins and RSVPs; a moderator resolves a report", async ({ browser }) => {
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signInAs(ownerContext, owner);

  const groupName = unique("Tuesday sets");
  const groupId = await createGroup(ownerPage, groupName);
  await expect(ownerPage.getByText("you own this group")).toBeVisible();

  // Schedule a meetup two hours from now.
  await ownerPage.getByText("Schedule a meetup").click();
  const start = new Date(Date.now() + 2 * 3600_000);
  start.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}T${pad(start.getHours())}:${pad(start.getMinutes())}`;
  await ownerPage.getByLabel("Starts").fill(local);
  await ownerPage.getByLabel("Where").fill("Library room 207");
  await ownerPage.getByRole("button", { name: "Schedule meetup" }).click();
  await expect(ownerPage.getByText("Meetup scheduled")).toBeVisible();
  await expect(ownerPage.getByTestId("meetup")).toHaveCount(1);
  await expect(ownerPage.getByTestId("meetup").first()).toContainText("1 going");

  // The calendar feed serves the meetup.
  const ics = await ownerPage.request.get(`/api/v1/groups/${groupId}/calendar.ics`);
  expect(ics.ok()).toBeTruthy();
  expect(await ics.text()).toContain("BEGIN:VEVENT");

  // A second student finds the group through the course page, joins, and RSVPs.
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await signInAs(memberContext, member);
  await memberPage.goto("/courses/COP4530");
  await memberPage.getByRole("link", { name: groupName }).click();
  await memberPage.getByRole("button", { name: "Join group" }).click();
  await expect(memberPage.getByText("You joined the group.")).toBeVisible();
  await memberPage.reload();
  await memberPage.getByRole("group", { name: "RSVP" }).getByRole("button", { name: "Maybe" }).click();
  await expect(memberPage.getByTestId("meetup").first()).toContainText("1 maybe");

  // The member's page lists the meetup, then they report the group.
  await memberPage.goto("/me");
  await expect(memberPage.getByText(groupName).first()).toBeVisible();
  await memberPage.goto(`/groups/${groupId}`);
  await memberPage.getByText("Report this group").click();
  await memberPage.getByLabel("What is wrong?").fill("Test report from the end-to-end suite, please dismiss.");
  await memberPage.getByRole("button", { name: "Send report" }).click();
  await expect(memberPage.getByText("A moderator will look at it")).toBeVisible();

  // A moderator sees and dismisses it; a plain member cannot open /admin.
  await memberPage.goto("/admin");
  await expect(memberPage).toHaveURL(/\/me/);
  const modContext = await browser.newContext();
  const modPage = await modContext.newPage();
  await signInAs(modContext, mod);
  await modPage.goto("/admin");
  const report = modPage.getByTestId("report").filter({ hasText: "end-to-end suite" }).first();
  await expect(report).toBeVisible();
  await report.getByRole("button", { name: "Dismiss" }).click();
  await expect(modPage.getByTestId("report").filter({ hasText: "end-to-end suite" })).toHaveCount(0);

  // The API rejects unauthenticated mutations and validates input.
  const anon = await ownerPage.request.fetch(`/api/v1/groups/${groupId}/join`, { method: "POST", headers: { cookie: "" } });
  expect(anon.status()).toBe(401);
  const bad = await ownerPage.request.post("/api/v1/meetups", { data: { groupId, startsAt: "yesterday", location: "x" } });
  expect(bad.status()).toBe(400);
  expect(await bad.json()).toHaveProperty("fields");

  await Promise.all([ownerContext.close(), memberContext.close(), modContext.close()]);
});

test("signed-out visitors are sent to sign in for protected pages and can read public ones", async ({ page }) => {
  await page.goto("/me");
  await expect(page).toHaveURL(/\/signin/);
  await page.goto("/courses");
  await expect(page.getByRole("heading", { level: 1, name: "Courses" })).toBeVisible();
  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "Privacy policy" })).toBeVisible();
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
});
