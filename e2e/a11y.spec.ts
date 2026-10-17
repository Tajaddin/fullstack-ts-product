import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { cleanupUsers, signInAs, unique } from "./helpers";

const user = { email: `${unique("a11y")}@example.edu`, name: "Ada Access", role: "admin" as const };

test.afterAll(async () => {
  await cleanupUsers([user.email]);
});

const publicPages = ["/", "/courses", "/courses/COP4530", "/privacy", "/signin"];
const signedInPages = ["/me", "/groups/new", "/admin"];

for (const path of publicPages) {
  test(`${path} has no serious or critical accessibility violations`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
  });
}

for (const path of signedInPages) {
  test(`${path} (signed in) has no serious or critical accessibility violations`, async ({ browser }) => {
    const context = await browser.newContext();
    await signInAs(context, user);
    const page = await context.newPage();
    await page.goto(path);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, JSON.stringify(serious, null, 2)).toEqual([]);
    await context.close();
  });
}
