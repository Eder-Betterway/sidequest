import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

test("the route map shows each stop, jumps to it, and works with no signal", async ({ page, context }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Map run");

  const map = page.getByRole("region", { name: "Route map" });
  await expect(map.getByRole("img", { name: /Map of 1 stop: Joshua Tree/ })).toBeVisible();
  await expect(map).toContainText("3 days");
  await expect(map.getByRole("link", { name: "Joshua Tree in Google Maps" })).toHaveAttribute("href", /google\.com\/maps\/search\/\?api=1&query=/);

  await map.getByRole("button", { name: /Joshua Tree/ }).click();
  await expect(page.getByRole("button", { name: /^Day 1, / })).toBeInViewport();

  await expect(page.getByTestId("status-line")).toContainText("Synced");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("region", { name: "Route map" }).getByRole("img")).toBeVisible();
});
