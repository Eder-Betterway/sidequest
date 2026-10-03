import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";

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

test("switches tabs", async ({ page }) => {
  await signIn(page, TESTER);
  await page.getByRole("button", { name: "Notes" }).click();
  await expect(page.getByRole("heading", { name: "Notes and local tips" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Notes" })).toHaveAttribute("aria-current", "page");
});
