import { expect, test, type Page } from "@playwright/test";
import { signIn, TESTER } from "./firebase";

async function newTrip(page: Page, name: string) {
  await page.getByRole("button", { name: "Trips" }).click();
  await page.getByRole("button", { name: "New trip" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Start").fill("2026-10-14");
  await page.getByLabel("End").fill("2026-10-18");
  await page.getByLabel("Traveling with").fill("");
  await page.getByRole("button", { name: "Create trip" }).click();
}

test("from trip details to three options to a day plan you can edit", async ({ page, context }) => {
  await signIn(page, TESTER);
  await newTrip(page, "Canyon country");

  // Not enough detail yet: Sidequest asks for it.
  await expect(page.getByText(/Still needed: at least one region/)).toBeVisible();
  await page.getByRole("button", { name: "Plan this trip" }).click();

  // Step 1: where.
  await page.getByRole("textbox", { name: "Regions or places" }).fill("Southern Utah");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("textbox", { name: "Regions or places" }).fill("Northern Arizona");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 2: a required milestone.
  await page.getByRole("button", { name: "+ Add a milestone" }).click();
  await page.getByLabel("What").fill("Friends' wedding");
  await page.getByLabel("Date").fill("2026-10-16");
  await page.getByLabel("Time").fill("16:00");
  await page.getByRole("button", { name: "Add milestone" }).click();
  await expect(page.getByText("Friends' wedding")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  // Step 3: van life.
  await page.getByRole("button", { name: "campervan" }).click();
  await page.getByLabel("Length (ft)").fill("21");
  await page.getByLabel("Max driving per day (hours)").fill("4");
  await page.getByRole("button", { name: "Next" }).click();

  // Steps 4 and 5: interests and the rest.
  await page.getByRole("group", { name: "Interests for You" }).getByRole("button", { name: "climbing" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  // Three options.
  await page.getByRole("button", { name: "Draft 3 options" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Slow and deep" })).toBeVisible();

  // Pick one: the day plan appears, one chip per day.
  await page.getByRole("button", { name: "Pick this one" }).first().click();
  await expect(page.getByRole("navigation", { name: "Days" }).getByRole("button")).toHaveCount(5);
  await expect(page.getByLabel("Sun times")).toContainText("Sunrise");

  // The wedding day has the milestone, locked.
  await page.getByRole("button", { name: /Day 3, Friday, Oct 16/ }).click();
  await expect(page.getByText("Friends' wedding")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlock Friends' wedding" })).toHaveAttribute("aria-pressed", "true");

  // Lock something else, then add your own item.
  await page.getByRole("button", { name: "Lock Sunset viewpoint" }).click();
  await expect(page.getByRole("button", { name: "Unlock Sunset viewpoint" })).toBeVisible();
  await page.getByRole("button", { name: "+ Add to this day" }).click();
  await page.getByLabel("What").fill("Swim at the slot canyon pool");
  await page.getByLabel("Start").fill("11:00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Swim at the slot canyon pool")).toBeVisible();

  // Edit an item.
  await page.getByText("Lunch at a local favorite").click();
  await page.getByLabel("What").fill("Lunch at the taco truck");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Lunch at the taco truck")).toBeVisible();

  // The whole plan is there with no signal.
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /Day 3, Friday, Oct 16/ }).click();
  await expect(page.getByText("Swim at the slot canyon pool")).toBeVisible();
  await expect(page.getByText("Friends' wedding")).toBeVisible();

  // AI needs signal, and says so instead of failing.
  await page.getByRole("radio", { name: "options" }).click();
  await expect(page.getByText("Drafting options needs signal.")).toBeVisible();
  await context.setOffline(false);
});
