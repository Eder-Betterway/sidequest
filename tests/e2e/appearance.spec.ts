import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";

const rootStyle = (page: import("@playwright/test").Page) =>
  page.evaluate(() => ({
    theme: document.documentElement.dataset.theme,
    accent: document.documentElement.style.getPropertyValue("--accent"),
    size: document.documentElement.style.fontSize,
    bg: getComputedStyle(document.body).backgroundColor,
  }));

test("pick a theme, a color, and a text size; they stick on this phone", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page, TESTER);
  expect(await rootStyle(page)).toMatchObject({ theme: "light", accent: "#d9480f", size: "100%" });

  await page.getByRole("button", { name: "Account" }).click();
  const sheet = page.getByRole("dialog", { name: "Account and settings" });
  await sheet.getByRole("radiogroup", { name: "Theme" }).getByRole("radio", { name: "dark" }).click();
  await sheet.getByRole("radio", { name: "Ocean" }).click();
  await sheet.getByRole("radiogroup", { name: "Text size" }).getByRole("radio", { name: "larger" }).click();
  await expect(sheet.getByRole("radio", { name: "Ocean" })).toHaveAttribute("aria-checked", "true");
  expect(await rootStyle(page)).toEqual({ theme: "dark", accent: "#6aaeff", size: "125%", bg: "rgb(18, 21, 27)" });

  // Applied before the page paints on the next visit.
  await page.reload();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
  expect(await rootStyle(page)).toMatchObject({ theme: "dark", accent: "#6aaeff", size: "125%" });

  // Match phone follows the phone, live.
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("radio", { name: "match phone" }).click();
  expect(await rootStyle(page)).toMatchObject({ theme: "light", accent: "#1c64c4" });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(async () => (await rootStyle(page)).theme).toBe("dark");
  expect(await rootStyle(page)).toMatchObject({ accent: "#6aaeff" });
});
