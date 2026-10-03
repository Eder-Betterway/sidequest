import { expect, test } from "@playwright/test";

test("opens on the trips tab and switches tabs", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sidequest" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your trips" })).toBeVisible();

  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByRole("heading", { name: "Notes and local tips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Notes" })).toHaveAttribute("aria-current", "page");
});

test("serves an installable manifest", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBe("Sidequest");
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) {
    expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  }
});

test("reopens with no signal once it has loaded", async ({ page, context }) => {
  await page.goto("/");
  // Wait until the service worker controls the page, then once more so the
  // shell and its assets land in the cache.
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
    }
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sidequest" })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sidequest" })).toBeVisible();
  await expect(page.getByTestId("status-line")).toContainText("Offline");

  await context.setOffline(false);
  await expect(page.getByTestId("status-line")).toContainText("Online");
});
