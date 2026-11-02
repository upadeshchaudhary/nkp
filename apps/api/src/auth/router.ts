import argon2 from "argon2";
import { rateLimit } from "express-rate-limit";
import { Router } from "express";
import { z } from "zod";
import { fail, ok } from "../response.js";
import { requireAuth } from "./middleware.js";
import {
  AccountDisabledError,
  AccountExistsError,
  GoogleAuthenticationError,
  GoogleIdentityConflictError,
  type AuthStore,
  type GoogleProvider,
} from "./types.js";
import {
  clearOAuthStateCookie,
  clearSessionCookie,
  cookieValue,
  hashToken,
  newToken,
  OAUTH_STATE_COOKIE,
  SESSION_COOKIE,
  SESSION_LIFETIME_SECONDS,
  setOAuthStateCookie,
  setSessionCookie,
  validOAuthState,
} from "./session.js";

const emailSchema = z.string().trim().email().max(254).transform((email) => email.toLowerCase());
const registrationSchema = z.object({
  email: emailSchema,
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(100).optional(),
});
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(128) });

export interface AuthOptions {
  store: AuthStore;
  sessionSecret: string;
  siteUrl: string;
  secureCookie: boolean;
  bootstrapAdminEmail?: string;
  googleProvider?: GoogleProvider;
}

function validationFailure(res: Parameters<typeof fail>[0], error: z.ZodError) {
  return fail(res, 400, "VALIDATION_ERROR", "Check the submitted details.", error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  })));
}

function redirectToLogin(siteUrl: string, language: "en" | "ne", result: "success" | "failed"): string {
  return new URL(`/${language}/login?google=${result}`, siteUrl).toString();
}

function secureToken(value: string | null): value is string {
  return Boolean(value && /^[a-f0-9]{64}$/.test(value));
}

export function authRouter(options: AuthOptions) {
  const router = Router();
  const secure = options.secureCookie;
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const authRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, res) => fail(res, 429, "RATE_LIMITED", "Too many authentication attempts. Try again later."),
  });

  router.get("/auth/providers", (_req, res) => ok(res, { google: Boolean(options.googleProvider) }));

  router.post("/auth/register", authRateLimit, async (req, res, next) => {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed.error);

    try {
      const passwordHash = await argon2.hash(parsed.data.password, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      });
      const account = await options.store.createPasswordAccount(
        parsed.data.email,
        passwordHash,
        parsed.data.displayName,
      );
      const token = newToken();
      await options.store.createSession(
        account.id,
        hashToken(token, options.sessionSecret),
        new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000),
        "password",
      );
      setSessionCookie(res, token, secure);
      return ok(res, { id: account.id, email: account.email }, undefined, 201);
    } catch (error) {
      if (error instanceof AccountExistsError) {
        return fail(res, 409, "ACCOUNT_EXISTS", "An account with this email already exists.");
      }
      return next(error);
    }
  });

  router.post("/auth/login", authRateLimit, async (req, res, next) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return validationFailure(res, parsed.error);

    try {
      const account = await options.store.findPasswordAccount(parsed.data.email);
      if (
        !account ||
        account.status !== "ACTIVE" ||
        !account.passwordHash ||
        !(await argon2.verify(account.passwordHash, parsed.data.password))
      ) {
        await options.store.recordFailedPasswordLogin();
        return fail(res, 401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
      }

      const token = newToken();
      await options.store.createSession(
        account.id,
        hashToken(token, options.sessionSecret),
        new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000),
        "password",
      );
      setSessionCookie(res, token, secure);
      return ok(res, { id: account.id, email: account.email });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/auth/google", (req, res) => {
    if (!options.googleProvider) {
      return fail(res, 503, "AUTH_PROVIDER_UNAVAILABLE", "Google sign-in is not configured.");
    }
    const language = req.query.lang === "ne" ? "ne" : "en";
    const state = newToken();
    setOAuthStateCookie(res, `${state}.${language}`, secure);
    return res.redirect(302, options.googleProvider.authorizationUrl(state));
  });

  router.get("/auth/google/callback", async (req, res, next) => {
    const stateCookie = cookieValue(req, OAUTH_STATE_COOKIE);
    const [expectedState, savedLanguage] = stateCookie?.split(".") ?? [];
    const language = savedLanguage === "ne" ? "ne" : "en";
    clearOAuthStateCookie(res, secure);

    if (!options.googleProvider) {
      return fail(res, 503, "AUTH_PROVIDER_UNAVAILABLE", "Google sign-in is not configured.");
    }
    if (!validOAuthState(expectedState ?? null, req.query.state)) {
      return fail(res, 400, "INVALID_OAUTH_STATE", "Google sign-in could not be verified. Please try again.");
    }
    if (typeof req.query.error === "string" || typeof req.query.code !== "string") {
      return res.redirect(302, redirectToLogin(options.siteUrl, language, "failed"));
    }

    try {
      const identity = await options.googleProvider.authenticate(req.query.code, expectedState);
      const account = await options.store.findOrCreateGoogleAccount(identity, options.bootstrapAdminEmail);
      if (account.status !== "ACTIVE") {
        return res.redirect(302, redirectToLogin(options.siteUrl, language, "failed"));
      }

      const token = newToken();
      await options.store.createSession(
        account.id,
        hashToken(token, options.sessionSecret),
        new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000),
        "google",
      );
      setSessionCookie(res, token, secure);
      return res.redirect(302, redirectToLogin(options.siteUrl, language, "success"));
    } catch (error) {
      if (
        error instanceof AccountDisabledError ||
        error instanceof GoogleAuthenticationError ||
        error instanceof GoogleIdentityConflictError
      ) {
        if (error instanceof GoogleAuthenticationError) console.warn("Google identity verification failed.");
        return res.redirect(302, redirectToLogin(options.siteUrl, language, "failed"));
      }
      return next(error);
    }
  });

  router.post("/auth/logout", async (req, res, next) => {
    try {
      const token = cookieValue(req, SESSION_COOKIE);
      if (secureToken(token)) await options.store.revokeSession(hashToken(token, options.sessionSecret), new Date());
      clearSessionCookie(res, secure);
      return ok(res, { signedOut: true });
    } catch (error) {
      return next(error);
    }
  });

  router.get("/auth/me", requireAuth(options.store, options.sessionSecret, secure), (req, res) => {
    const user = req.auth;
    if (!user) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    return ok(res, user);
  });

  return router;
}
