import { loadEnv } from "./config/env.js";
import { createApp } from "./app.js";
import { checkDatabase } from "./db.js";
import { createGoogleProvider } from "./auth/google.js";
import { createAuthStore } from "./auth/store.js";
import { createCmsStore } from "./cms/store.js";
import { createMediaStore } from "./media/store.js";
import { createR2Storage } from "./media/storage.js";

const env = loadEnv();
const googleProvider = env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI
  ? createGoogleProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI)
  : undefined;
const app = createApp({
  checkDatabase,
  siteName: env.PUBLIC_SITE_NAME,
  corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()),
  cmsStore: createCmsStore(),
  mediaStore: createMediaStore(),
  mediaStorage: env.R2_ACCOUNT_ID && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && env.R2_BUCKET
    ? createR2Storage({
        accountId: env.R2_ACCOUNT_ID,
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        bucket: env.R2_BUCKET,
      })
    : undefined,
  auth: {
    store: createAuthStore(),
    sessionSecret: env.SESSION_SECRET,
    siteUrl: env.PUBLIC_SITE_URL,
    secureCookie: env.NODE_ENV === "production",
    bootstrapAdminEmail: env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase(),
    googleProvider,
  },
});

app.listen(env.API_PORT, () => {
  console.log(`API listening on port ${env.API_PORT}`);
});
