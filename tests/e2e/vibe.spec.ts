import { expect, test, type Page } from "@playwright/test";
import { signIn, TESTER } from "./firebase";

/** A 3-day planned trip with a locked milestone on day 2 (stand-in AI). */
async function plannedTrip(page: Page, name: string) {
  await page.getByRole("button", { name: "Trips" }).click();
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Start").fill("2026-11-02");
  await page.getByLabel("End").fill("2026-11-04");
  await page.getByLabel("Traveling with").fill("");
  await page.getByRole("button", { name: "Create trip" }).click();
  await page.getByRole("button", { name: "Plan this trip" }).click();
  await page.getByRole("textbox", { name: "Regions or places" }).fill("Joshua Tree");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "+ Add a milestone" }).click();
  await page.getByLabel("What").fill("Desert concert");
  await page.getByLabel("Date").fill("2026-11-03");
  await page.getByLabel("Time").fill("20:00");
  await page.getByRole("button", { name: "Add milestone" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "campervan" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^(Next|Done)$/ }).click();
  await page.getByRole("button", { name: "Draft 3 options" }).click();
  await page.getByRole("button", { name: "Pick this one" }).first().click();
  await expect(page.getByRole("navigation", { name: "Days" }).getByRole("button")).toHaveCount(3);
}

test("chill out one day, review the suggestion, keep what you like", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Desert weekend");
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  await expect(page.getByText("Morning walk around Joshua Tree")).toBeVisible();

  // Dial this day way down.
  await page.getByRole("button", { name: "Day vibe" }).click();
  await page.getByLabel("Pace").fill("10");
  await expect(page.getByText("very chill")).toBeVisible();
  await expect(page.getByRole("button", { name: /changed/ })).toBeVisible();

  // Re-plan: a suggestion comes back as a list of changes.
  await page.getByRole("button", { name: "Re-plan this day" }).click();
  const sheet = page.getByRole("dialog", { name: "Suggested changes" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText("Slowed the day down")).toBeVisible();
  await expect(sheet.getByText(/Drop Morning walk/)).toBeVisible();
  await expect(sheet.getByText(/Add Slow morning at camp/)).toBeVisible();
  // The locked concert is never part of a suggestion.
  await expect(sheet.getByText(/Desert concert/)).toHaveCount(0);

  // Keep the drop, skip the add.
  await sheet.getByRole("checkbox", { name: /Add Slow morning at camp/ }).uncheck();
  await sheet.getByRole("button", { name: "Apply 1 change" }).click();
  await expect(sheet).toBeHidden();

  await expect(page.getByText("Morning walk around Joshua Tree")).toHaveCount(0);
  await expect(page.getByText("Slow morning at camp")).toHaveCount(0);
  await expect(page.getByText("Desert concert")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock Desert concert" })).toBeVisible();
  // Planned with the new vibe now, so no longer "changed".
  await expect(page.getByRole("button", { name: /changed/ })).toHaveCount(0);
});

test("change the trip's vibe and re-plan every affected day", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Packed weekend");

  await page.getByRole("button", { name: "Trip vibe" }).click();
  await page.getByRole("dialog", { name: "Trip vibe" }).getByLabel("Pace").fill("90");
  await page.getByRole("button", { name: "Save and re-plan 3 days" }).click();
  await expect(page.getByText("Done. Suggestions are waiting on 3 days.")).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  // Each day now has a suggestion waiting.
  await page.getByRole("button", { name: /Day 3, Wednesday, Nov 4/ }).click();
  await page.getByRole("button", { name: "Suggested changes ready" }).click();
  await expect(page.getByText(/Add Afternoon scenic drive/)).toBeVisible();
  await page.getByRole("button", { name: "Skip all" }).click();
  await expect(page.getByRole("button", { name: "Suggested changes ready" })).toHaveCount(0);
});
