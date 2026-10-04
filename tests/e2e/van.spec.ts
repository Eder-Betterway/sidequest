import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";

test("van trip: drive-in heads-ups, places to sleep and restock, and both work offline", async ({ page, context }) => {
  await signIn(page, TESTER);
  await page.getByRole("button", { name: /^Switch trip/ }).click();
  await page.getByRole("dialog", { name: "Your trips" }).getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Name").fill("Van loop");
  await page.getByLabel("Start").fill("2026-11-02");
  await page.getByLabel("End").fill("2026-11-04");
  await page.getByLabel("Traveling with").fill("");
  await page.getByRole("button", { name: "Create trip" }).click();
  await page.getByRole("button", { name: "Plan this trip" }).click();
  for (const region of ["Joshua Tree", "Mojave"]) {
    await page.getByRole("textbox", { name: "Regions or places" }).fill(region);
    await page.getByRole("button", { name: "Add", exact: true }).click();
  }
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "campervan" }).click();
  await page.getByLabel("Length (ft)").fill("25");
  await page.getByLabel("Max driving per day (hours)").fill("4");
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: /^(Next|Done)$/ }).click();
  await page.getByRole("button", { name: "Draft 3 options" }).click();
  await page.getByRole("button", { name: "Pick this one" }).first().click();

  // Day 2 moves from Joshua Tree to Mojave: the drive in, against your 4h limit.
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  await expect(page.getByText("Drive in from Joshua Tree")).toBeVisible();
  await expect(page.getByText("5h 30m · 256 mi")).toBeVisible();
  await expect(page.getByText("Over your 4h a day. Split it or start early.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Directions ›" })).toHaveAttribute("href", /google\.com\/maps\/dir/);

  // Day 1 has no drive in.
  await page.getByRole("button", { name: /Day 1, Monday, Nov 2/ }).click();
  await expect(page.getByText(/Drive in from/)).toHaveCount(0);

  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  await page.getByRole("button", { name: "Sleep and restock nearby ›" }).click();
  const sheet = page.getByRole("dialog", { name: "Sleep and restock near Mojave" });
  const sleep = sheet.getByRole("region", { name: "Places to sleep" });
  await expect(sleep).toContainText("Canyon Rim Campground");
  await expect(sleep).toContainText("Max 23 ft");
  await expect(sleep).toContainText("Posted limit is shorter than your van.");
  await expect(sleep).toContainText("BLM dispersed area");
  await expect(sleep).toContainText("Free");
  await expect(sheet.getByRole("region", { name: "Dump stations" })).toContainText("Gas station dump");
  await expect(sheet.getByRole("region", { name: "Water" })).toContainText("None on the map nearby");
  await expect(sheet.getByRole("link", { name: "Recreation.gov campgrounds ›" })).toBeVisible();
  await expect(sheet.getByText("check signs and limits")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  // No signal: the drive and the spots are saved.
  await expect(page.getByTestId("status-line")).toContainText("Synced");
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  await expect(page.getByText("5h 30m · 256 mi")).toBeVisible();
  await page.getByRole("button", { name: "Sleep and restock nearby ›" }).click();
  await expect(page.getByRole("dialog", { name: "Sleep and restock near Mojave" })).toContainText("Canyon Rim Campground");
  await context.setOffline(false);
});
