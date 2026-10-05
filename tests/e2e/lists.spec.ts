import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

test("start a van checklist, tick things off (even offline), add your own, reset for next time", async ({ page, context }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Checklist trip");
  await page.getByRole("button", { name: "Notes", exact: true }).click();

  const card = page.getByRole("region", { name: "Checklists" });
  await card.getByRole("button", { name: "Start a checklist ›" }).click();
  await page.getByRole("dialog", { name: "Checklists" }).getByRole("button", { name: "+ Van ready before we roll" }).click();

  const list = page.getByRole("dialog", { name: "Van ready before we roll" });
  await expect(list).toContainText("0 of 11 done");
  await list.getByRole("checkbox", { name: "Propane off" }).check();
  await expect(list).toContainText("1 of 11 done");

  // No signal: still ticks.
  await expect(page.getByTestId("status-line")).toContainText("Synced");
  await context.setOffline(true);
  await list.getByRole("checkbox", { name: "Windows closed" }).check();
  await list.getByLabel("Add to this list").fill("Bikes locked on the rack");
  await list.getByRole("button", { name: "Add", exact: true }).click();
  await expect(list).toContainText("2 of 12 done");
  await context.setOffline(false);

  await list.getByRole("button", { name: "Reset for next time" }).click();
  await expect(list).toContainText("0 of 12 done");
  await list.getByRole("button", { name: "Close", exact: true }).click();
  await expect(card.getByRole("button", { name: /Van ready before we roll/ })).toContainText("0 of 12");
});
