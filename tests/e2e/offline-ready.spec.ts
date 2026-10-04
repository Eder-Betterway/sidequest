import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

test("get ready for no signal: one tap saves every stop, then it all opens in airplane mode", async ({ page, context }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Remote stretch");

  await page.getByRole("button", { name: "Get ready for no signal" }).click();
  const sheet = page.getByRole("dialog", { name: "Get ready for no signal" });
  await expect(sheet).toContainText("Details, weather, and holidays for 1 stop");
  await expect(sheet).toContainText("Sleep and restock for 1 stop");
  await sheet.getByRole("button", { name: "Save 2 things" }).click();
  await expect(sheet).toContainText("Done. Saved 2.");
  await sheet.getByRole("button", { name: "Close" }).click();

  // Opening it again: nothing left to do.
  await page.getByRole("button", { name: "Get ready for no signal" }).click();
  await expect(sheet).toContainText("Already ready.");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("status-line")).toContainText("Synced");

  // Airplane mode, cold reopen: place details and sleep spots are there, never opened before.
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  await page.getByRole("button", { name: "About Joshua Tree ›" }).click();
  const place = page.getByRole("dialog", { name: "Joshua Tree" });
  await expect(place.getByRole("region", { name: "Highlights", exact: true })).toContainText("The overlook trail");
  await expect(place.getByRole("region", { name: "Forecast", exact: true })).toContainText("Clear");
  await place.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Sleep and restock nearby ›" }).click();
  await expect(page.getByRole("dialog", { name: "Sleep and restock near Joshua Tree" })).toContainText("Canyon Rim Campground");
  await context.setOffline(false);
});
