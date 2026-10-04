import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";

test("describe a trip in a sentence, review what's filled in, and it's ready to plan", async ({ page }) => {
  await signIn(page, TESTER);
  await page.getByRole("button", { name: /^Switch trip/ }).click();
  await page.getByRole("dialog", { name: "Your trips" }).getByRole("button", { name: "New trip" }).click();

  const sheet = page.getByRole("dialog", { name: "New trip" });
  await sheet.getByLabel("Describe it in a sentence (optional)").fill(
    "Two weeks in a month, SoCal desert in the van, wedding in Palm Springs near the end, we love climbing and hot springs"
  );
  await sheet.getByRole("button", { name: "Fill in the details" }).click();

  // The basics land in the form; the rest is listed for review.
  await expect(sheet.getByLabel("Name")).toHaveValue("Desert wedding loop");
  await expect(sheet.getByLabel("Start")).not.toHaveValue("");
  const review = sheet.getByRole("region", { name: "Describe it" });
  await expect(review).toContainText("Places: Joshua Tree, California, Palm Springs, California");
  await expect(review).toContainText("Milestones: Friends' wedding");
  await expect(review).toContainText("Getting around: campervan");
  await expect(review).toContainText("Into: climbing, hot springs");

  await sheet.getByLabel("Name").fill("Desert wedding");
  await sheet.getByLabel("Traveling with").fill("");
  await sheet.getByRole("button", { name: "Create trip" }).click();

  // Straight to options: nothing left to fill in first.
  await expect(page.getByRole("heading", { level: 1, name: "Desert wedding" })).toBeVisible();
  await expect(page.getByText(/Still needed/)).toHaveCount(0);
  await page.getByRole("button", { name: "Draft 3 options" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
});
