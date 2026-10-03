import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { EMULATOR_PROJECT_ID, USE_EMULATORS } from "@/lib/firebase/config";

/**
 * The bouncer for every /api route that costs money (Claude, Places...).
 * The phone sends its Firebase ID token as `Authorization: Bearer <token>`;
 * we check Google's signature, the project, and the email allowlist.
 *
 * Fails closed: no allowlist configured means nobody gets in.
 */

const GOOGLE_KEYS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
let googleKeys: JWTVerifyGetKey | null = null;

export interface Member {
  uid: string;
  email: string;
}

export type GuardResult = { ok: true; member: Member } | { ok: false; response: Response };

export interface GuardOptions {
  projectId?: string;
  /** Comma-separated emails (ALLOWED_EMAILS). */
  allowedEmails?: string;
  /** Override the signing keys (tests). */
  keys?: JWTVerifyGetKey;
  /**
   * Accept the unsigned tokens the Firebase Auth emulator issues. Only on when
   * FIREBASE_AUTH_EMULATOR_HOST is set on the server, which never happens on Vercel.
   */
  acceptEmulatorTokens?: boolean;
}

function deny(status: 401 | 403 | 503, error: string): GuardResult {
  return { ok: false, response: Response.json({ error }, { status }) };
}

export function parseAllowlist(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function requireMember(req: Request, opts: GuardOptions = {}): Promise<GuardResult> {
  const projectId =
    opts.projectId ?? (USE_EMULATORS ? EMULATOR_PROJECT_ID : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
  const allowed = parseAllowlist(opts.allowedEmails ?? process.env.ALLOWED_EMAILS);
  const emulator = opts.acceptEmulatorTokens ?? Boolean(process.env.FIREBASE_AUTH_EMULATOR_HOST);

  if (!projectId) return deny(503, "Sign-in isn't set up on the server yet.");

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return deny(401, "Sign in first.");

  let payload: JWTPayload;
  try {
    if (emulator) {
      payload = decodeJwt(token);
      if (payload.aud !== projectId) throw new Error("wrong project");
    } else {
      googleKeys ??= createRemoteJWKSet(new URL(GOOGLE_KEYS));
      ({ payload } = await jwtVerify(token, opts.keys ?? googleKeys, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
      }));
    }
  } catch {
    return deny(401, "Your sign-in expired. Close and reopen the app.");
  }

  const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
  const uid = payload.sub ?? "";
  if (!email || !uid) return deny(401, "Sign in first.");
  if (!allowed.has(email)) return deny(403, "This account isn't on the list for Sidequest.");

  return { ok: true, member: { uid, email } };
}
