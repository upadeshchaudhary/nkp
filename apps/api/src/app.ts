import express from "express";
import cors from "cors";
import helmet from "helmet";
import { authRouter, type AuthOptions } from "./auth/router.js";
import { cmsRouter } from "./cms/router.js";
import type { CmsStore } from "./cms/types.js";
import { mediaRouter } from "./media/router.js";
import type { MediaStorage, MediaStore } from "./media/types.js";
import { healthRouter, type HealthDeps } from "./routes/health.js";
import { fail } from "./response.js";

export interface AppOptions extends HealthDeps {
  corsOrigins: string[];
  auth: AuthOptions;
  cmsStore?: CmsStore;
  mediaStore?: MediaStore;
  mediaStorage?: MediaStorage;
}

export function createApp(options: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: options.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "1mb" }));

  app.use("/api/v1", healthRouter(options));
  app.use("/api/v1", authRouter(options.auth));
  if (options.cmsStore) app.use("/api/v1", cmsRouter(options.cmsStore, options.auth));
  if (options.mediaStore) {
    app.use("/api/v1", mediaRouter(options.mediaStore, options.mediaStorage, options.auth));
  }

  app.use((_req, res) => fail(res, 404, "NOT_FOUND", "Resource not found."));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    return fail(res, 500, "INTERNAL_ERROR", "Unexpected server error.");
  });

  return app;
}
