import { expect, test } from "@playwright/test";
import { PARTNER, signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shift = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return iso(d);
};

test("mid-trip, the app opens on Today: the stop, weather, light, now and next", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Happening now", { start: shift(-1), end: shift(1) });

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText(/^Day 2 of 3 ·/)).toBeVisible();
  await expect(page.getByText("Exploring Joshua Tree")).toBeVisible();
  await expect(page.getByText(/Clear · \d+° \/ \d+° · 10% rain/)).toBeVisible();
  await expect(page.getByText("Public holiday: Sample Day. Some places may close.")).toBeVisible();
  await expect(page.getByText(/^(Sunset \d{1,2}:\d{2}[ap]m, in |Sunrise tomorrow)/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Now and next" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Ask about this day" })).toBeVisible();

  // Reopening the app mid-trip lands here.
  await page.reload();
  await expect(page.getByRole("button", { name: "Today", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/^Day 2 of 3 ·/)).toBeVisible();

  // Jump into today in the plan.
  await page.getByRole("button", { name: "Open today" }).click();
  await expect(page.getByRole("navigation", { name: "Days" }).getByRole("button", { name: /^Day 2,/ })).toHaveAttribute("aria-current", "date");
});

test("undo a removed item and an applied suggestion", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Undo weekend");
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();

  // Remove an item, then undo it from the toast.
  await page.getByText("Lunch at a local favorite").click();
  await page.getByRole("button", { name: "Remove from the plan" }).click();
  await expect(page.getByText("Lunch at a local favorite", { exact: true })).toHaveCount(0);
  const toast = page.getByRole("status");
  await expect(toast).toContainText('Removed "Lunch at a local favorite"');
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Lunch at a local favorite", { exact: true })).toBeVisible();

  // Apply a suggestion, then undo it.
  await page.getByRole("button", { name: "Day vibe" }).click();
  await page.getByLabel("Pace").fill("10");
  await page.getByRole("button", { name: "Re-plan this day" }).click();
  await page.getByRole("dialog", { name: "Suggested changes" }).getByRole("button", { name: /^Apply/ }).click();
  await expect(page.getByText("Slow morning at camp")).toBeVisible();
  await expect(page.getByText("Morning walk around Joshua Tree")).toHaveCount(0);
  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("Morning walk around Joshua Tree")).toBeVisible();
  await expect(page.getByText("Slow morning at camp")).toHaveCount(0);

  // The history lists all of it.
  await page.getByRole("radio", { name: "itinerary" }).click();
  await page.getByRole("button", { name: "Recent changes and undo ›" }).click();
  const history = page.getByRole("dialog", { name: "Recent changes" });
  await expect(history).toContainText("Undid: Applied");
  await expect(history).toContainText('Undid: Removed "Lunch at a local favorite"');
});

test("each phone sees what the other changed since it last looked", async ({ page, browser }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Two phones", { partner: PARTNER });

  const partnerContext = await browser.newContext({ ...test.info().project.use });
  const partner = await partnerContext.newPage();
  await signIn(partner, PARTNER);
  await partner.getByRole("button", { name: "Pick a trip" }).click();
  await partner.getByRole("dialog", { name: "Your trips" }).getByRole("button", { name: /Two phones/ }).click();
  await expect(partner.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ })).toBeVisible();
  await expect(partner.getByRole("region", { name: "Since you last looked" })).toHaveCount(0);

  // A change on the first phone shows up on the second.
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  await page.getByText("Sunset viewpoint").click();
  await page.getByRole("button", { name: "Remove from the plan" }).click();

  const card = partner.getByRole("region", { name: "Since you last looked" });
  await expect(card).toContainText('tester Removed "Sunset viewpoint"');
  await card.getByRole("button", { name: "Got it" }).click();
  await expect(card).toHaveCount(0);
  await partnerContext.close();
});
