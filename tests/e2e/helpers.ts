import { expect, type Page } from "@playwright/test";

/** A 3-day planned trip with a locked milestone on day 2 (stand-in AI). */
export async function plannedTrip(page: Page, name: string, opts: { start?: string; end?: string; partner?: string } = {}) {
  await page.getByRole("button", { name: /^Switch trip/ }).click();
  await page.getByRole("dialog", { name: "Your trips" }).getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Start").fill(opts.start ?? "2026-11-02");
  await page.getByLabel("End").fill(opts.end ?? "2026-11-04");
  await page.getByLabel("Traveling with").fill(opts.partner ?? "");
  await page.getByRole("button", { name: "Create trip" }).click();
  await page.getByRole("button", { name: "Plan this trip" }).click();
  await page.getByRole("textbox", { name: "Regions or places" }).fill("Joshua Tree");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "+ Add a milestone" }).click();
  await page.getByLabel("What").fill("Desert concert");
  await page.getByLabel("Date").fill(opts.start ? opts.end! : "2026-11-03");
  await page.getByLabel("Time").fill("20:00");
  await page.getByRole("button", { name: "Add milestone" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "campervan" }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^(Next|Done)$/ }).click();
  await page.getByRole("button", { name: "Draft 3 options" }).click();
  await page.getByRole("button", { name: "Pick this one" }).first().click();
  // Lands on the itinerary: one row per day (named like the day chips, so tests can open any day).
  await expect(page.getByRole("button", { name: /^Day \d+, / })).toHaveCount(3);
}
