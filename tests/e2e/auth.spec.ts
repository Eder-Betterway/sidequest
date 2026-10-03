import { expect, test } from "@playwright/test";
import { PASSWORD, signIn, STRANGER, TESTER } from "./firebase";

test("a wrong password gets a friendly message", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Email").fill(TESTER);
  await page.getByLabel("Password").fill(PASSWORD + "nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
});

test("someone with an account but not on the allowlist sees nothing", async ({ page }) => {
  await signIn(page, STRANGER);
  await expect(page.getByRole("heading", { name: "This account isn't on the list yet" })).toBeVisible();
});

test("signing out returns to the sign-in screen", async ({ page }) => {
  await signIn(page, TESTER);
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});
