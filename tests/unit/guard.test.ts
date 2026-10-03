import { beforeAll, describe, expect, it } from "vitest";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTVerifyGetKey } from "jose";
import { parseAllowlist, requireMember } from "@/lib/ai/guard";

const PROJECT = "sidequest-test";
const ALLOWED = "one@example.com, Two@Example.com";

let keys: JWTVerifyGetKey;
let privateKey: CryptoKey;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: "k1", alg: "RS256" };
  keys = createLocalJWKSet({ keys: [jwk] });
});

function token(claims: Record<string, unknown>, opts: { project?: string; expired?: boolean } = {}) {
  const project = opts.project ?? PROJECT;
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: "k1" })
    .setIssuer(`https://securetoken.google.com/${project}`)
    .setAudience(project)
    .setSubject("uid-123")
    .setIssuedAt(now - 60)
    .setExpirationTime(opts.expired ? now - 10 : now + 3600)
    .sign(privateKey);
}

function req(bearer?: string) {
  return new Request("http://localhost/api/x", {
    headers: bearer ? { authorization: `Bearer ${bearer}` } : {},
  });
}

const opts = () => ({ projectId: PROJECT, allowedEmails: ALLOWED, keys, acceptEmulatorTokens: false });

describe("requireMember", () => {
  it("lets in an allowlisted, correctly signed user", async () => {
    const r = await requireMember(req(await token({ email: "Two@example.com" })), opts());
    expect(r).toEqual({ ok: true, member: { uid: "uid-123", email: "two@example.com" } });
  });

  it("401s with no token", async () => {
    const r = await requireMember(req(), opts());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(401);
  });

  it("401s an expired or wrong-project token", async () => {
    for (const t of [
      await token({ email: "one@example.com" }, { expired: true }),
      await token({ email: "one@example.com" }, { project: "someone-else" }),
      "not-a-jwt",
    ]) {
      const r = await requireMember(req(t), opts());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.response.status).toBe(401);
    }
  });

  it("403s a valid user who isn't on the allowlist", async () => {
    const r = await requireMember(req(await token({ email: "stranger@example.com" })), opts());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("fails closed when no allowlist is set", async () => {
    const r = await requireMember(req(await token({ email: "one@example.com" })), { ...opts(), allowedEmails: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(403);
  });

  it("503s when the server has no Firebase project configured", async () => {
    const r = await requireMember(req(await token({ email: "one@example.com" })), { ...opts(), projectId: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(503);
  });
});

describe("parseAllowlist", () => {
  it("trims, lowercases, and drops blanks", () => {
    expect([...parseAllowlist(" A@x.com,, b@Y.com ")]).toEqual(["a@x.com", "b@y.com"]);
    expect(parseAllowlist(undefined).size).toBe(0);
  });
});
