import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";

test("first run: three short screens with home-screen tips, once per phone", async ({ page }) => {
  await signIn(page, TESTER, { welcome: true });
  const welcome = page.getByRole("dialog", { name: "Welcome to Sidequest" });
  await expect(welcome).toContainText("Plan the trip together");
  await welcome.getByRole("button", { name: "Next" }).click();
  await expect(welcome).toContainText("Made for no signal");
  await welcome.getByRole("button", { name: "Back" }).click();
  await expect(welcome).toContainText("1 of 3");
  await welcome.getByRole("button", { name: "Next" }).click();
  await welcome.getByRole("button", { name: "Next" }).click();
  // The test phone is an Android: Chrome's steps.
  await expect(welcome).toContainText("Put it on your home screen");
  await expect(welcome).toContainText("Tap Install app");
  await welcome.getByRole("button", { name: "Let's go" }).click();
  await expect(welcome).toBeHidden();

  // Not again on this phone.
  await page.reload();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  await expect(welcome).toBeHidden();

  // But it's there in Settings whenever you want it.
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "How Sidequest works" }).click();
  await expect(welcome).toContainText("Plan the trip together");
  await welcome.getByRole("button", { name: "Skip" }).click();
  await expect(welcome).toBeHidden();
});
