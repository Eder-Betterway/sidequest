import { expect, test } from "@playwright/test";
import { PARTNER, signIn, TESTER } from "./firebase";

test("a trip made on one phone shows up live on the other, and can be deleted", async ({ page, browser }) => {
  await signIn(page, TESTER);
  await page.getByRole("button", { name: /^Switch trip/ }).click();
  await page.getByRole("dialog", { name: "Your trips" }).getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Name").fill("Shared desert loop");
  await page.getByLabel("Start").fill("2026-10-14");
  await page.getByLabel("End").fill("2026-10-28");
  await page.getByLabel("Traveling with").fill(PARTNER);
  await page.getByRole("button", { name: "Create trip" }).click();

  // Creating opens the trip on the Plan tab; its name is the switcher at the top.
  await expect(page.getByRole("heading", { level: 1, name: "Shared desert loop" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch trip (Shared desert loop)" })).toBeVisible();
  await expect(page.getByText("Oct 14 to 28, 2026")).toBeVisible();

  // The partner's phone: a separate browser with its own storage.
  const partnerContext = await browser.newContext({ ...test.info().project.use });
  const partner = await partnerContext.newPage();
  await signIn(partner, PARTNER);
  // Nothing open on that phone yet: it offers to pick one.
  await partner.getByRole("button", { name: "Pick a trip" }).click();
  const theirs = partner.getByRole("dialog", { name: "Your trips" });
  await expect(theirs.getByRole("button", { name: /Shared desert loop/ })).toContainText(`With ${TESTER}`);

  // Deleting on one phone removes it from the other.
  await page.getByRole("button", { name: "Delete this trip" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(theirs.getByRole("button", { name: /Shared desert loop/ })).toHaveCount(0);
  await partnerContext.close();
});

test("the new-trip form explains what's wrong", async ({ page }) => {
  await signIn(page, TESTER);
  await page.getByRole("button", { name: /^Switch trip/ }).click();
  await page.getByRole("dialog", { name: "Your trips" }).getByRole("button", { name: "New trip" }).click();
  await page.getByRole("button", { name: "Create trip" }).click();
  await expect(page.getByText("Give the trip a name.")).toBeVisible();
});
