import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

// A real (tiny) image, so the phone's photo shrinking runs for real.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

test("a local tip becomes a plan suggestion you accept", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Tip trip");
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();

  // Quick capture right from the day.
  await page.getByRole("button", { name: "Jot a tip or note" }).click();
  const capture = page.getByRole("dialog", { name: "Add a local tip" });
  await capture.getByLabel("What did you hear?").fill("Ranger says the hot springs are empty at dawn");
  await expect(capture.getByLabel("About")).toHaveValue("2026-11-03");
  await capture.getByRole("button", { name: "Save" }).click();

  await page.getByRole("button", { name: "Notes", exact: true }).click();
  const card = page.getByRole("article", { name: /Tip: Ranger says/ });
  await expect(card).toContainText("You ·");
  await expect(card).toContainText("Tue, Nov 3 · Joshua Tree");

  await card.getByRole("button", { name: "Work into the plan" }).click();
  const sheet = page.getByRole("dialog", { name: "Suggested changes" });
  await expect(sheet.getByText("Worked your tip into the day.")).toBeVisible();
  await expect(sheet.getByText(/From a tip: "Ranger says/)).toBeVisible();
  await sheet.getByRole("button", { name: "Apply 1 change" }).click();
  await expect(sheet).toBeHidden();
  await expect(card).toContainText("Turned into a plan suggestion.");

  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  await expect(page.getByText("Tip: Ranger says the hot springs are empty at dawn")).toBeVisible();
});

test("a question asked with no signal gets answered once you're back online", async ({ page, context }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Question trip");
  await expect(page.getByTestId("status-line")).toContainText("Synced");
  await page.getByRole("button", { name: "Notes", exact: true }).click();

  await context.setOffline(true);
  await page.getByRole("button", { name: "Question", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Ask a question" });
  await sheet.getByLabel("Your question").fill("Can we park the van overnight at the trailhead?");
  await sheet.getByRole("button", { name: "Ask", exact: true }).click();
  const card = page.getByRole("article", { name: /Question: Can we park/ });
  await expect(card).toContainText("Waiting for signal.");

  await context.setOffline(false);
  await expect(card).toContainText("Short answer: yes.");
  await expect(card.getByRole("link", { name: "Example visitor guide" })).toBeVisible();

  // An answer can feed the plan too.
  await card.getByLabel("Day to change").selectOption("2026-11-02");
  await card.getByRole("button", { name: "Work into the plan" }).click();
  const suggestion = page.getByRole("dialog", { name: "Suggested changes" });
  await expect(suggestion.getByText(/Add Tip: We asked: Can we park/)).toBeVisible();
  await suggestion.getByRole("button", { name: "Skip all" }).click();
  await expect(suggestion).toBeHidden();
});

test("snap a flyer, pick its events, and they land on the plan", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Flyer trip");
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Flyer photo" }).click();

  const sheet = page.getByRole("dialog", { name: "Snap a flyer" });
  await sheet.getByLabel("Flyer photo", { exact: true }).setInputFiles({ name: "flyer.png", mimeType: "image/png", buffer: PNG });
  await expect(sheet.getByRole("img", { name: "Flyer to read" })).toBeVisible();
  await sheet.getByRole("button", { name: "Save" }).click();

  const card = page.getByRole("article", { name: /Flyer/ });
  await expect(card.getByText("Night market")).toBeVisible();
  await expect(card.getByText("Open mic")).toBeVisible();
  // Dated for a trip day: ticked. No date on the flyer: your call.
  await expect(card.getByRole("checkbox", { name: /Night market/ })).toBeChecked();
  await expect(card.getByRole("checkbox", { name: /Open mic/ })).not.toBeChecked();
  await card.getByRole("button", { name: "Add 1 to the plan" }).click();
  await expect(card.getByText("Added to the plan.")).toBeVisible();
  // The photo isn't kept once it's read.
  await expect(card.getByRole("img")).toHaveCount(0);

  await page.getByRole("button", { name: "Plan", exact: true }).click();
  await page.getByRole("button", { name: /Day 1, Monday, Nov 2/ }).click();
  await expect(page.getByText("Night market")).toBeVisible();
  await expect(page.getByText("Cash only")).toBeVisible();
});
