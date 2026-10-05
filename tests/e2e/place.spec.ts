import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

test("dig into a stop: story, light, weather, stargazing, food, booking, parks, holidays, events, hours, offline", async ({ page, context }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Desert deep-dive");
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();

  await page.getByRole("button", { name: "About Joshua Tree ›" }).click();
  const sheet = page.getByRole("dialog", { name: "Joshua Tree" });
  await expect(sheet.getByRole("region", { name: "Why go", exact: true })).toContainText("slow, scenic stay");
  await expect(sheet.getByRole("region", { name: "Light", exact: true })).toContainText("Sunrise");
  await expect(sheet.getByRole("region", { name: "Forecast", exact: true })).toContainText("Clear");
  await expect(sheet.getByRole("region", { name: "Public holidays", exact: true })).toContainText("Sample Day");
  const stars = sheet.getByRole("region", { name: "Stargazing", exact: true });
  await expect(stars).toContainText("Dark: faint glow low on the horizon. Most glow from Sample Town");
  await expect(stars.getByRole("listitem")).toHaveCount(3);
  await expect(stars).toContainText("clouds 5%");
  await expect(stars).toContainText(/Dark with no moon|The moon is up all night/);
  await expect(sheet.getByRole("link", { name: "Saturday farmers market" })).toHaveAttribute("href", "https://example.com/market");
  await expect(sheet.getByRole("region", { name: "History", exact: true })).toContainText("trading post");
  const eat = sheet.getByRole("region", { name: "Eat and drink", exact: true });
  await expect(eat).toContainText("Sample Coffee Co · coffee · $");
  await expect(eat.getByRole("link", { name: "The Sample Grill on Google Maps" })).toHaveAttribute("href", /google\.com\/maps\/search\/.*Sample/);
  const parks = sheet.getByRole("region", { name: "Parks and campgrounds", exact: true });
  await expect(parks.getByRole("link", { name: "Sample National Park" })).toHaveAttribute("href", "https://www.nps.gov/samp/");
  await parks.getByText("Scenic road closed for repairs").click();
  await expect(parks.getByText("The upper loop is closed weekdays.")).toBeVisible();
  await expect(parks.getByRole("link", { name: "Book Sample Rocks Campground" })).toHaveAttribute("href", "https://www.recreation.gov/camping/campgrounds/123456");
  const book = sheet.getByRole("region", { name: "Book ahead", exact: true });
  await expect(book).toContainText("Opens 6 months ahead");
  await expect(book.getByRole("link", { name: "Book on Recreation.gov ›" })).toHaveAttribute("href", "https://www.recreation.gov/");
  await expect(sheet.getByRole("link", { name: /Wikipedia/ })).toBeVisible();
  await expect(sheet.getByText("The write-up is AI research.")).toBeVisible();

  await sheet.getByRole("button", { name: "Get opening hours" }).click();
  await expect(sheet.getByText("Tuesday: Closed")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();

  // A single spot from the day's plan has its own details.
  await page.getByRole("button", { name: "Details for Lunch at a local favorite" }).click();
  await expect(page.getByRole("dialog", { name: "Joshua Tree" }).getByRole("region", { name: "Why go", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  // No signal: everything already looked up is still there.
  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();
  await page.getByRole("button", { name: "About Joshua Tree ›" }).click();
  const offline = page.getByRole("dialog", { name: "Joshua Tree" });
  await expect(offline.getByRole("region", { name: "Highlights", exact: true })).toContainText("The overlook trail");
  await expect(offline.getByRole("region", { name: "Stargazing", exact: true })).toContainText("Milky Way core");
  await expect(offline.getByRole("region", { name: "Eat and drink", exact: true })).toContainText("The Sample Grill");
  await expect(offline.getByRole("region", { name: "Parks and campgrounds", exact: true })).toContainText("Scenic road closed");
  await expect(offline.getByRole("button", { name: "Opening hours need signal" })).toBeDisabled();
  await context.setOffline(false);
});
