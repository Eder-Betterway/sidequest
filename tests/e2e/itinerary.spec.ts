import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

test("the whole trip at a glance, a change request that moves a day, and a rule that sticks", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Wedding weekend");

  // Every day under its stop, with what's planned.
  const stop = page.getByRole("region", { name: "Joshua Tree" });
  await expect(stop).toContainText("Nov 2 to 4, 2026 · 3 days");
  await expect(page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ })).toContainText("★ 8pm Desert concert");

  // Ask for a change on the last day, and keep it as a rule.
  await page.getByRole("button", { name: "Change Wednesday, Nov 4" }).click();
  const ask = page.getByRole("dialog", { name: "Change Wednesday, Nov 4" });
  await ask.getByLabel("What should change?").fill("We need to still be in Palm Springs this day for the wedding");
  await ask.getByLabel("Keep as a rule for every re-plan").check();
  await ask.getByRole("button", { name: "Suggest changes" }).click();

  // Review it day by day.
  const review = page.getByRole("dialog", { name: "Suggested trip changes" });
  await expect(review.getByText("Stayed on in Palm Springs for the wedding")).toBeVisible();
  await expect(review).toContainText("Stay in Palm Springs (was Joshua Tree)");
  await expect(review.getByText(/Add Pool afternoon before the wedding/)).toBeVisible();
  await review.getByRole("button", { name: "Apply 1 day" }).click();
  await expect(review).toBeHidden();

  // The itinerary now has a Palm Springs stop, and the rule is listed.
  await expect(page.getByRole("region", { name: "Palm Springs" })).toContainText("Nov 4, 2026 · 1 day");
  await expect(page.getByRole("region", { name: "Joshua Tree" })).toContainText("2 days");
  await expect(page.getByText("On 2026-11-04: We need to still be in Palm Springs this day for the wedding")).toBeVisible();

  // Open the moved day: new base, new item, sun times for the new place.
  await page.getByRole("button", { name: /Day 3, Wednesday, Nov 4/ }).click();
  await expect(page.getByRole("button", { name: "About Palm Springs ›" })).toBeVisible();
  await expect(page.getByText("Pool afternoon before the wedding")).toBeVisible();
  await expect(page.getByLabel("Sun times")).toContainText("local time at Palm Springs");

  // Rules can be removed.
  await page.getByRole("radio", { name: "itinerary" }).click();
  await page.getByRole("button", { name: /Remove rule/ }).click();
  await expect(page.getByText(/On 2026-11-04/)).toHaveCount(0);

  // Questions about the whole trip go to Ask, ready to type.
  await page.getByRole("button", { name: "Ask about the trip" }).click();
  const q = page.getByRole("dialog", { name: "Ask a question" });
  await expect(q.getByLabel("About")).toHaveValue("");
  await q.getByLabel("Your question").fill("Does this line up well with the weather?");
  await q.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(page.getByRole("article", { name: /Question: Does this line up/ })).toContainText("Short answer: yes.");
});
