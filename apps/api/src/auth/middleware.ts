import type { NextFunction, Request, Response } from "express";
import { fail } from "../response.js";
import { cookieValue, hashToken, SESSION_COOKIE, clearSessionCookie } from "./session.js";
import type { AuthStore } from "./types.js";

export function requireAuth(store: AuthStore, sessionSecret: string, secureCookie: boolean) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = cookieValue(req, SESSION_COOKIE);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) {
      if (token) clearSessionCookie(res, secureCookie);
      return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    }

    try {
      const principal = await store.findSession(hashToken(token, sessionSecret), new Date());
      if (!principal) {
        clearSessionCookie(res, secureCookie);
        return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
      }
      req.auth = principal;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) return fail(res, 401, "UNAUTHENTICATED", "Sign in to continue.");
    if (!req.auth.permissions.includes(permission) && !req.auth.permissions.includes("*")) {
      return fail(res, 403, "FORBIDDEN", "You do not have permission to perform this action.");
    }
    return next();
  };
}
