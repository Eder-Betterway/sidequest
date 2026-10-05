import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

test("save draft changes on days (even offline), then suggest them together", async ({ page, context }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Draft weekend");
  await expect(page.getByTestId("status-line")).toContainText("Synced");

  // A draft for the last day: saved, not sent.
  await page.getByRole("button", { name: "Change Wednesday, Nov 4" }).click();
  let sheet = page.getByRole("dialog", { name: "Change Wednesday, Nov 4" });
  await sheet.getByLabel("What should change?").fill("Still in Palm Springs for the wedding");
  await sheet.getByLabel("Keep as a rule for every re-plan").check();
  await sheet.getByRole("button", { name: "Save draft" }).click();
  await expect(sheet.getByRole("region", { name: "Draft changes" })).toContainText("Still in Palm Springs for the wedding");
  await expect(sheet.getByRole("region", { name: "Draft changes" })).toContainText("Will be kept as a rule");
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: /Day 3, Wednesday, Nov 4/ })).toContainText("1 draft");

  // Another, from inside a day, with no signal.
  await context.setOffline(true);
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  await page.getByRole("button", { name: "Change this day" }).click();
  sheet = page.getByRole("dialog", { name: "Change Tuesday, Nov 3" });
  await sheet.getByLabel("What should change?").fill("Get to Palm Springs a day early");
  await expect(sheet.getByRole("button", { name: "Suggesting needs signal" })).toBeDisabled();
  await sheet.getByRole("button", { name: "Save draft" }).click();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: "Change this day (1 draft)" })).toBeVisible();
  await context.setOffline(false);

  // Both go to Claude together, from the itinerary.
  await page.getByRole("radio", { name: "itinerary" }).click();
  await page.getByRole("button", { name: "Review 2 draft changes" }).click();
  sheet = page.getByRole("dialog", { name: "Change the trip" });
  await expect(sheet.getByRole("region", { name: "Draft changes" })).toContainText("Tue, Nov 3");
  await expect(sheet.getByRole("region", { name: "Draft changes" })).toContainText("Wed, Nov 4");
  await sheet.getByRole("button", { name: "Suggest 2 changes" }).click();

  const review = page.getByRole("dialog", { name: "Suggested trip changes" });
  await expect(review.getByRole("checkbox", { name: /Tuesday, Nov 3/ })).toBeChecked();
  await expect(review.getByRole("checkbox", { name: /Wednesday, Nov 4/ })).toBeChecked();
  await review.getByRole("button", { name: "Apply 2 days" }).click();
  await expect(review).toBeHidden();

  // Applied: drafts are done, the rule stays.
  await expect(page.getByRole("region", { name: "Palm Springs" })).toContainText("2 days");
  await expect(page.getByRole("button", { name: "Change the trip" })).toBeVisible();
  await expect(page.getByText(/draft/)).toHaveCount(0);
  await expect(page.getByText("On 2026-11-04: Still in Palm Springs for the wedding")).toBeVisible();
});

test("ask about the whole trip or a single day without leaving the plan", async ({ page, context }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Question weekend");
  await expect(page.getByTestId("status-line")).toContainText("Synced");

  const trip = page.getByRole("region", { name: "Ask about the trip" });
  await trip.getByLabel("Question about the trip").fill("Does this line up well with the weather?");
  await trip.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(trip.getByRole("listitem", { name: /Does this line up/ })).toContainText("Short answer: yes.");
  await expect(trip.getByRole("link", { name: "Example visitor guide" })).toBeVisible();

  // A day's questions stay with that day, and wait for signal if there's none.
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  const day = page.getByRole("region", { name: "Ask about this day" });
  await expect(day.getByRole("listitem")).toHaveCount(0);
  await context.setOffline(true);
  await day.getByLabel("Question about this day").fill("Will the trail be too hot by noon?");
  await day.getByRole("button", { name: "Ask", exact: true }).click();
  const q = day.getByRole("listitem", { name: /too hot by noon/ });
  await expect(q).toContainText("Waiting for signal.");
  await context.setOffline(false);
  await expect(q).toContainText("Short answer: yes.");

  // Both also show up in Notes.
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByRole("article", { name: /Question: Will the trail/ })).toBeVisible();
  await expect(page.getByRole("article", { name: /Question: Does this line up/ })).toBeVisible();
});

test("edit a draft in place: fix the wording, move it to another day, or cancel", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Draft edits");

  await page.getByRole("button", { name: "Change Tuesday, Nov 3" }).click();
  let sheet = page.getByRole("dialog", { name: "Change Tuesday, Nov 3" });
  await sheet.getByLabel("What should change?").fill("Only one night in the first town");
  await sheet.getByRole("button", { name: "Save draft" }).click();
  await sheet.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Review 1 draft change" }).click();
  sheet = page.getByRole("dialog", { name: "Change the trip" });
  const drafts = sheet.getByRole("region", { name: "Draft changes" });

  // Cancel leaves it as it was.
  await drafts.getByRole("button", { name: "Edit draft: Only one night in the first town" }).click();
  let editing = drafts.getByRole("listitem", { name: "Editing draft" });
  await editing.getByLabel("Draft text").fill("Something else entirely");
  await editing.getByRole("button", { name: "Cancel" }).click();
  await expect(drafts).toContainText("Only one night in the first town");

  // Fix the wording, move it to Wednesday, and keep it as a rule.
  await drafts.getByRole("button", { name: "Edit draft: Only one night in the first town" }).click();
  editing = drafts.getByRole("listitem", { name: "Editing draft" });
  await expect(editing.getByLabel("Draft text")).toHaveValue("Only one night in the first town");
  await editing.getByLabel("Draft text").fill("Two nights in the first town, then move on");
  await editing.getByLabel("Which day").selectOption({ label: "Wed, Nov 4" });
  await editing.getByLabel("Keep as a rule for every re-plan").check();
  await editing.getByRole("button", { name: "Save changes" }).click();
  await expect(editing).toBeHidden();
  await expect(drafts).toContainText("Wed, Nov 4");
  await expect(drafts).toContainText("Two nights in the first town, then move on");
  await expect(drafts).toContainText("Will be kept as a rule");

  // An empty draft can't be saved.
  await drafts.getByRole("button", { name: /^Edit draft: Two nights/ }).click();
  editing = drafts.getByRole("listitem", { name: "Editing draft" });
  await editing.getByLabel("Draft text").fill("   ");
  await expect(editing.getByRole("button", { name: "Save changes" })).toBeDisabled();
  await editing.getByRole("button", { name: "Cancel" }).click();

  // The itinerary shows the draft on its new day.
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("button", { name: /Day 3, Wednesday, Nov 4/ })).toContainText("1 draft");
  await expect(page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ })).not.toContainText("draft");
});

test("suggesting shows live progress, and a failure says why and keeps the drafts", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Progress run");

  await page.getByRole("button", { name: "Change Tuesday, Nov 3" }).click();
  let sheet = page.getByRole("dialog", { name: "Change Tuesday, Nov 3" });
  await sheet.getByLabel("What should change?").fill("Slow morning [mock:too-long]");
  await sheet.getByRole("button", { name: "Save draft" }).click();
  await sheet.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Review 1 draft change" }).click();
  sheet = page.getByRole("dialog", { name: "Change the trip" });
  await sheet.getByRole("button", { name: "Suggest changes" }).click();
  // The stages show while it works, with a bar and a clock.
  await expect(sheet.getByRole("status", { name: "Progress" })).toBeVisible();
  await expect(sheet.getByRole("progressbar", { name: "Working" })).toBeVisible();
  // The stand-in says the answer ran too long: the reason is shown and the draft stays.
  await expect(sheet.getByRole("alert")).toContainText("ran too long and got cut off");
  await expect(sheet.getByRole("alert")).toContainText("Your drafts are still saved.");
  await expect(sheet.getByRole("status", { name: "Progress" })).toBeHidden();
  await expect(sheet.getByRole("region", { name: "Draft changes" })).toContainText("Slow morning");

  // Fix the draft and try again: it goes through.
  await sheet.getByRole("button", { name: /^Edit draft: Slow morning/ }).click();
  await sheet.getByLabel("Draft text").fill("Slow morning, then the park");
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await sheet.getByRole("button", { name: "Suggest changes" }).click();
  await expect(page.getByRole("dialog", { name: "Suggested trip changes" })).toBeVisible();
});
