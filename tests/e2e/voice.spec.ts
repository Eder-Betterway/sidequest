import { expect, test } from "@playwright/test";
import { signIn, TESTER } from "./firebase";
import { plannedTrip } from "./helpers";

// Stand-ins for the phone's speech features: dictation "hears" a fixed phrase,
// and reading aloud records what would have been said.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown> & { __spoken: string[] };
    w.__spoken = [];
    class FakeUtterance {
      text: string;
      onstart?: () => void;
      onend?: () => void;
      constructor(t: string) {
        this.text = t;
      }
    }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: FakeUtterance, configurable: true });
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        speak(u: FakeUtterance) {
          w.__spoken.push(u.text);
          u.onstart?.();
        },
        cancel() {},
        getVoices: () => [],
      },
    });
    class FakeRecognition {
      onresult?: (e: unknown) => void;
      onend?: () => void;
      start() {
        setTimeout(() => {
          const result = Object.assign([{ transcript: "hot springs are empty at dawn" }], { isFinal: true });
          this.onresult?.({ resultIndex: 0, results: [result] });
          setTimeout(() => this.onend?.(), 10);
        }, 20);
      }
      stop() {
        this.onend?.();
      }
    }
    Object.defineProperty(window, "SpeechRecognition", { value: FakeRecognition, configurable: true });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: FakeRecognition, configurable: true });
  });
});

const spoken = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);

test("dictate a tip and a question, and hear the answer and the day read aloud", async ({ page }) => {
  await signIn(page, TESTER);
  await plannedTrip(page, "Voice trip");
  await page.getByRole("button", { name: /Day 2, Tuesday, Nov 3/ }).click();

  // Dictate a tip.
  await page.getByRole("button", { name: "Jot a tip or note" }).click();
  const capture = page.getByRole("dialog", { name: "Add a local tip" });
  await capture.getByRole("button", { name: "Dictate" }).click();
  await expect(capture.getByLabel("What did you hear?")).toHaveValue("hot springs are empty at dawn");
  await capture.getByRole("button", { name: "Save" }).click();

  // Ask out loud, then hear the answer.
  const ask = page.getByRole("region", { name: "Ask about this day" });
  await ask.getByRole("button", { name: "Ask out loud" }).click();
  await expect(ask.getByLabel("Question about this day")).toHaveValue("hot springs are empty at dawn");
  await ask.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(ask.getByText("Short answer: yes.")).toBeVisible();
  await ask.getByRole("button", { name: "Read aloud" }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)).toContain("Short answer: yes.");
  await expect(ask.getByRole("button", { name: "Stop reading" })).toBeVisible();

  // The whole day, read in order.
  await page.getByRole("button", { name: "Read this day aloud" }).click();
  await expect.poll(async () => (await spoken(page)).at(-1)).toMatch(/^Exploring Joshua Tree, in Joshua Tree\. 8:30 a\.m\.: Morning walk/);

  await page.getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page.getByRole("article", { name: /Tip: hot springs are empty at dawn/ })).toBeVisible();
});
