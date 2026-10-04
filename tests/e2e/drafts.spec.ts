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
  await trip.getByRole("button", { name: "Ask" }).click();
  await expect(trip.getByRole("listitem", { name: /Does this line up/ })).toContainText("Short answer: yes.");
  await expect(trip.getByRole("link", { name: "Example visitor guide" })).toBeVisible();

  // A day's questions stay with that day, and wait for signal if there's none.
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  const day = page.getByRole("region", { name: "Ask about this day" });
  await expect(day.getByRole("listitem")).toHaveCount(0);
  await context.setOffline(true);
  await day.getByLabel("Question about this day").fill("Will the trail be too hot by noon?");
  await day.getByRole("button", { name: "Ask" }).click();
  const q = day.getByRole("listitem", { name: /too hot by noon/ });
  await expect(q).toContainText("Waiting for signal.");
  await context.setOffline(false);
  await expect(q).toContainText("Short answer: yes.");

  // Both also show up in Notes.
  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByRole("article", { name: /Question: Will the trail/ })).toBeVisible();
  await expect(page.getByRole("article", { name: /Question: Does this line up/ })).toBeVisible();
});
