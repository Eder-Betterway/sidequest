import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";

async function waitForServiceWorker(page: import("@playwright/test").Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
  });
}

async function newTrip(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: /^Switch trip/ }).click();
  await page.getByRole("dialog", { name: "Your trips" }).getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Traveling with").fill("");
  await page.getByRole("button", { name: "Create trip" }).click();
}

test("reopens with no signal, keeps trips, and syncs changes made offline", async ({ page, context }) => {
  await signIn(page, TESTER);
  await waitForServiceWorker(page);
  await newTrip(page, "Before the canyon");
  // Wait for the server to confirm it before cutting the signal.
  await page.getByRole("button", { name: /^Switch trip/ }).click();
  const list = page.getByRole("dialog", { name: "Your trips" });
  const before = list.getByRole("button", { name: /Before the canyon/ });
  await expect(before).toBeVisible();
  await expect(before).not.toContainText("waiting to sync");
  await expect(page.getByTestId("status-line")).toContainText("Synced");
  await list.getByRole("button", { name: "Close" }).click();

  // Airplane mode, then a cold reopen.
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId("status-line")).toContainText("Offline");
  await expect(page.getByRole("button", { name: "Switch trip (Before the canyon)" })).toBeVisible();

  // A trip made with no signal is saved on the phone and marked as waiting.
  await newTrip(page, "Made in the canyon");
  await page.getByRole("button", { name: /^Switch trip/ }).click();
  await expect(list.getByRole("button", { name: /Before the canyon/ })).toBeVisible();
  await expect(list.getByRole("button", { name: /Made in the canyon/ })).toContainText("waiting to sync");
  await expect(page.getByTestId("status-line")).toContainText("1 waiting to sync");

  // Back in signal: it goes up on its own.
  await context.setOffline(false);
  await expect(list.getByRole("button", { name: /Made in the canyon/ })).not.toContainText("waiting to sync");
  await expect(page.getByTestId("status-line")).toContainText("Synced");
});
