import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

test("add the trip to a calendar, and see what the AI cost this month", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Calendar run");

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Add to calendar" }).click()]);
  expect(download.suggestedFilename()).toBe("calendar-run.ics");
  const ics = (await readFile((await download.path())!, "utf8")).replace(/\r\n /g, "");
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics.match(/DTSTART;VALUE=DATE:/g)).toHaveLength(3);
  // The concert is at 8pm stop time (the stand-in map says Mountain): 03:00 UTC the next day.
  expect(ics).toContain("DTSTART:20261104T030000Z");
  expect(ics).toContain("SUMMARY:★ Desert concert");

  // Drafting options logged its usage; Settings adds it up.
  await page.getByRole("button", { name: "Account" }).click();
  const spend = page.getByRole("region", { name: "AI spent this month" });
  await expect(spend).toContainText(/About \$\d+\.\d\d/);
  await expect(spend).toContainText("Trip options");
  await expect(spend).toContainText("An estimate");
});
