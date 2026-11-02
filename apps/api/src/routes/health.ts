import { Router } from "express";
import { ok, fail } from "../response.js";

export interface HealthDeps {
  checkDatabase: () => Promise<boolean>;
  siteName: string;
}

export function healthRouter(deps: HealthDeps) {
  const router = Router();

  router.get("/health", async (_req, res) => {
    const database = await deps.checkDatabase();
    const body = { status: database ? "ok" : "degraded", database, site: deps.siteName };
    return database ? ok(res, body) : fail(res, 503, "DEPENDENCY_UNAVAILABLE", "Database is unavailable.", [body]);
  });

  return router;
}
