// Helpers for the local Firebase test servers (see firebase.json).
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

const PROJECT = "demo-sidequest";
const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = "http://127.0.0.1:8080";

export const PASSWORD = "test-password-123";
export const TESTER = "tester@example.com";
export const PARTNER = "partner@example.com";
/** Has an account, but isn't on the allowlist. */
export const STRANGER = "stranger@example.com";

export async function resetEmulators() {
  await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  await fetch(`${AUTH}/emulator/v1/projects/${PROJECT}/accounts`, { method: "DELETE" });
}

export async function createUser(email: string) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`Couldn't create ${email}: ${await res.text()}`);
}

export async function setAllowlist(emails: string[]) {
  const res = await fetch(
    `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/config/allowlist`,
    {
      method: "PATCH",
      // "owner" bypasses security rules on the emulator, like editing in the Firebase console.
      headers: { authorization: "Bearer owner", "content-type": "application/json" },
      body: JSON.stringify({
        fields: { emails: { arrayValue: { values: emails.map((e) => ({ stringValue: e })) } } },
      }),
    }
  );
  if (!res.ok) throw new Error(`Couldn't write the allowlist: ${await res.text()}`);
}

export async function signIn(page: Page, email: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("button", { name: "Account" })).toBeVisible();
}
