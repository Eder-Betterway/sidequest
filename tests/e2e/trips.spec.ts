import { expect, test } from "@playwright/test";
import { PARTNER, signIn, TESTER } from "./firebase";

test("a trip made on one phone shows up live on the other, and can be deleted", async ({ page, browser }) => {
  await signIn(page, TESTER);
  await page.getByRole("button", { name: "Trips" }).click();
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Name").fill("Shared desert loop");
  await page.getByLabel("Start").fill("2026-10-14");
  await page.getByLabel("End").fill("2026-10-28");
  await page.getByLabel("Traveling with").fill(PARTNER);
  await page.getByRole("button", { name: "Create trip" }).click();

  // Creating opens the trip on the Plan tab.
  await expect(page.getByRole("heading", { level: 2, name: "Shared desert loop" })).toBeVisible();
  await expect(page.getByText("Oct 14 to 28, 2026")).toBeVisible();

  // The partner's phone: a separate browser with its own storage.
  const partnerContext = await browser.newContext({ ...test.info().project.use });
  const partner = await partnerContext.newPage();
  await signIn(partner, PARTNER);
  await partner.getByRole("button", { name: "Trips" }).click();
  await expect(partner.getByRole("button", { name: /Shared desert loop/ })).toContainText(`With ${TESTER}`);

  // Deleting on one phone removes it from the other.
  await page.getByRole("button", { name: "Delete this trip" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(partner.getByRole("button", { name: /Shared desert loop/ })).toHaveCount(0);
  await partnerContext.close();
});

test("the new-trip form explains what's wrong", async ({ page }) => {
  await signIn(page, TESTER);
  await page.getByRole("button", { name: "Trips" }).click();
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByRole("button", { name: "Create trip" }).click();
  await expect(page.getByText("Give the trip a name.")).toBeVisible();
});
