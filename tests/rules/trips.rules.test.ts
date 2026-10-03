import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from "firebase/firestore";

const ME = "me@example.com";
const PARTNER = "partner@example.com";
const STRANGER = "stranger@example.com"; // signed in, but not on the allowlist
const OUTSIDER = "outsider@example.com"; // on the allowlist, but not on this trip

let env: RulesTestEnvironment;

const trip = (overrides: Record<string, unknown> = {}) => ({
  title: "Desert loop",
  startDate: null,
  endDate: null,
  memberEmails: [ME, PARTNER],
  createdBy: ME,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

const as = (email: string) => env.authenticatedContext(email.split("@")[0], { email }).firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-sidequest-rules",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "config/allowlist"), { emails: [ME, PARTNER, OUTSIDER] });
    await setDoc(doc(db, "trips/t1"), trip());
    await setDoc(doc(db, "trips/t1/notes/n1"), { text: "Ask about the hot springs" });
  });
});

describe("trips", () => {
  it("members can read, list, and edit their trip", async () => {
    await assertSucceeds(getDoc(doc(as(PARTNER), "trips/t1")));
    await assertSucceeds(getDocs(query(collection(as(ME), "trips"), where("memberEmails", "array-contains", ME))));
    await assertSucceeds(updateDoc(doc(as(PARTNER), "trips/t1"), { title: "Desert and coast", updatedAt: 2 }));
  });

  it("allowlisted people who aren't on the trip can't see it", async () => {
    await assertFails(getDoc(doc(as(OUTSIDER), "trips/t1")));
    await assertFails(getDocs(collection(as(OUTSIDER), "trips")));
    await assertFails(updateDoc(doc(as(OUTSIDER), "trips/t1"), { title: "mine now" }));
  });

  it("signed-in strangers get nothing, even on a trip that lists them", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "trips/t2"), trip({ memberEmails: [STRANGER], createdBy: STRANGER }));
    });
    await assertFails(getDoc(doc(as(STRANGER), "trips/t2")));
    await assertFails(setDoc(doc(as(STRANGER), "trips/t3"), trip({ memberEmails: [STRANGER], createdBy: STRANGER })));
  });

  it("signed-out visitors get nothing", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "trips/t1")));
    await assertFails(getDoc(doc(anon, "config/allowlist")));
  });

  it("you can only create trips you're on, as yourself", async () => {
    await assertSucceeds(setDoc(doc(as(ME), "trips/new"), trip()));
    await assertFails(setDoc(doc(as(ME), "trips/x"), trip({ memberEmails: [PARTNER] })));
    await assertFails(setDoc(doc(as(ME), "trips/y"), trip({ createdBy: PARTNER })));
    await assertFails(setDoc(doc(as(ME), "trips/z"), trip({ title: "" })));
  });

  it("members can't remove themselves or rewrite who made it", async () => {
    await assertFails(updateDoc(doc(as(PARTNER), "trips/t1"), { memberEmails: [ME] }));
    await assertFails(updateDoc(doc(as(PARTNER), "trips/t1"), { createdBy: PARTNER }));
  });

  it("members can delete", async () => {
    await assertSucceeds(deleteDoc(doc(as(PARTNER), "trips/t1")));
  });

  it("matches emails without caring about capitals", async () => {
    const shouty = env.authenticatedContext("me", { email: "ME@Example.com" }).firestore();
    await assertSucceeds(getDoc(doc(shouty, "trips/t1")));
  });
});

describe("inside a trip", () => {
  it("follows the trip's members", async () => {
    await assertSucceeds(getDoc(doc(as(PARTNER), "trips/t1/notes/n1")));
    await assertSucceeds(setDoc(doc(as(ME), "trips/t1/notes/n2"), { text: "Sunset at the overlook" }));
    await assertFails(getDoc(doc(as(OUTSIDER), "trips/t1/notes/n1")));
    await assertFails(setDoc(doc(as(STRANGER), "trips/t1/notes/n3"), { text: "hi" }));
  });
});

describe("config", () => {
  it("can't be read or changed from the app", async () => {
    await assertFails(getDoc(doc(as(ME), "config/allowlist")));
    await assertFails(setDoc(doc(as(ME), "config/allowlist"), { emails: [ME, STRANGER] }));
  });
});
