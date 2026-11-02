import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";

export const SESSION_COOKIE = "nkp_session";
export const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
export const OAUTH_STATE_COOKIE = "nkp_google_state";
export const OAUTH_STATE_LIFETIME_SECONDS = 10 * 60;

export function newToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0 || pair.slice(0, separator).trim() !== name) continue;
    return pair.slice(separator + 1).trim();
  }
  return null;
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  const secureAttribute = secure ? "; Secure" : "";
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=${SESSION_LIFETIME_SECONDS}${secureAttribute}`,
  );
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  const secureAttribute = secure ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/v1; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttribute}`,
  );
}

export function setOAuthStateCookie(res: Response, state: string, secure: boolean): void {
  const secureAttribute = secure ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; SameSite=Lax; Path=/api/v1/auth/google; Max-Age=${OAUTH_STATE_LIFETIME_SECONDS}${secureAttribute}`,
  );
}

export function clearOAuthStateCookie(res: Response, secure: boolean): void {
  const secureAttribute = secure ? "; Secure" : "";
  res.append("Set-Cookie", `${OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/api/v1/auth/google; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secureAttribute}`);
}

export function validOAuthState(expected: string | null, actual: unknown): actual is string {
  if (!expected || typeof actual !== "string" || !/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(actual)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(actual, "hex"));
}
