import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

test("dig into a stop: story, light, weather, holidays, what's on, hours, and it reads offline", async ({ page, context }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Desert deep-dive");
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();

  await page.getByRole("button", { name: "About Joshua Tree ›" }).click();
  const sheet = page.getByRole("dialog", { name: "Joshua Tree" });
  await expect(sheet.getByRole("region", { name: "Why go", exact: true })).toContainText("slow, scenic stay");
  await expect(sheet.getByRole("region", { name: "Light", exact: true })).toContainText("Sunrise");
  await expect(sheet.getByRole("region", { name: "Forecast", exact: true })).toContainText("Clear");
  await expect(sheet.getByRole("region", { name: "Public holidays", exact: true })).toContainText("Sample Day");
  await expect(sheet.getByRole("link", { name: "Saturday farmers market" })).toHaveAttribute("href", "https://example.com/market");
  await expect(sheet.getByRole("region", { name: "History", exact: true })).toContainText("trading post");
  await expect(sheet.getByRole("link", { name: /Wikipedia/ })).toBeVisible();
  await expect(sheet.getByText("The write-up is AI research.")).toBeVisible();

  await sheet.getByRole("button", { name: "Get opening hours" }).click();
  await expect(sheet.getByText("Tuesday: Closed")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  // A single spot from the day's plan has its own details.
  await page.getByRole("button", { name: "Details for Lunch at a local favorite" }).click();
  await expect(page.getByRole("dialog", { name: "Joshua Tree" }).getByRole("region", { name: "Why go", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  // No signal: everything already looked up is still there.
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  await page.getByRole("button", { name: "About Joshua Tree ›" }).click();
  const offline = page.getByRole("dialog", { name: "Joshua Tree" });
  await expect(offline.getByRole("region", { name: "Highlights", exact: true })).toContainText("The overlook trail");
  await expect(offline.getByRole("button", { name: "Opening hours need signal" })).toBeDisabled();
  await context.setOffline(false);
});
