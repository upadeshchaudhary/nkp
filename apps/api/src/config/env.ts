import "dotenv/config";
import { z } from "zod";

const optionalEnvString = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.string().trim().min(1).optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  PUBLIC_SITE_NAME: z.string().default("Nepali Knowledge Platform"),
  PUBLIC_SITE_URL: z.string().url().refine((value) => /^https?:\/\//.test(value)).default("http://localhost:5173"),
  GOOGLE_CLIENT_ID: optionalEnvString,
  GOOGLE_CLIENT_SECRET: optionalEnvString,
  GOOGLE_REDIRECT_URI: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().url().refine((url) => /^https?:\/\//.test(url)).optional(),
  ),
  BOOTSTRAP_ADMIN_EMAIL: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().email().transform((email) => email.toLowerCase()).optional(),
  ),
  R2_ACCOUNT_ID: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().regex(/^[a-f0-9]{32}$/i).optional(),
  ),
  R2_ACCESS_KEY_ID: optionalEnvString,
  R2_SECRET_ACCESS_KEY: optionalEnvString,
  R2_BUCKET: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
    z.string().trim().regex(/^(?=.{3,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/).optional(),
  ),
}).superRefine((values, context) => {
  const googleSettings = [values.GOOGLE_CLIENT_ID, values.GOOGLE_CLIENT_SECRET, values.GOOGLE_REDIRECT_URI];
  const googleEnabled = googleSettings.every(Boolean);
  if (googleSettings.some(Boolean) && !googleEnabled) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["GOOGLE_CLIENT_ID"],
      message: "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be configured together",
    });
  }
  if (googleEnabled && !values.BOOTSTRAP_ADMIN_EMAIL) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["BOOTSTRAP_ADMIN_EMAIL"],
      message: "Set BOOTSTRAP_ADMIN_EMAIL to configure the first administrator",
    });
  }
  const r2Settings = [
    values.R2_ACCOUNT_ID,
    values.R2_ACCESS_KEY_ID,
    values.R2_SECRET_ACCESS_KEY,
    values.R2_BUCKET,
  ];
  if (r2Settings.some(Boolean) && !r2Settings.every(Boolean)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["R2_ACCOUNT_ID"],
      message: "R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must be configured together",
    });
  }
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
