export interface AuthPrincipal {
  id: string;
  email: string;
  roles: Array<{ name: string; permissions: string[] }>;
  permissions: string[];
}

export interface PasswordAccount {
  id: string;
  email: string;
  passwordHash: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
}

export interface AuthAccount {
  id: string;
  email: string;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
}

export interface GoogleIdentity {
  subject: string;
  email: string;
  name?: string;
}

export interface AuthStore {
  createPasswordAccount(email: string, passwordHash: string, displayName?: string): Promise<AuthAccount>;
  findPasswordAccount(email: string): Promise<PasswordAccount | null>;
  findOrCreateGoogleAccount(identity: GoogleIdentity, bootstrapAdminEmail?: string): Promise<AuthAccount>;
  recordFailedPasswordLogin(): Promise<void>;
  createSession(userId: string, tokenHash: string, expiresAt: Date, method: "password" | "google"): Promise<void>;
  findSession(tokenHash: string, now: Date): Promise<AuthPrincipal | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
}

export interface GoogleProvider {
  authorizationUrl(state: string): string;
  authenticate(code: string, nonce: string): Promise<GoogleIdentity>;
}

export class AccountExistsError extends Error {}
export class GoogleIdentityConflictError extends Error {}
export class AccountDisabledError extends Error {}
export class GoogleAuthenticationError extends Error {}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPrincipal;
    }
  }
}
