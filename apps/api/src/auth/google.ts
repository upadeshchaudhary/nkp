import { OAuth2Client } from "google-auth-library";
import { GoogleAuthenticationError, type GoogleProvider } from "./types.js";

export function createGoogleProvider(clientId: string, clientSecret: string, redirectUri: string): GoogleProvider {
  const client = new OAuth2Client(clientId, clientSecret, redirectUri);

  return {
    authorizationUrl(state) {
      return client.generateAuthUrl({
        access_type: "online",
        nonce: state,
        prompt: "select_account",
        response_type: "code",
        scope: ["openid", "email", "profile"],
        state,
      });
    },
    async authenticate(code, nonce) {
      try {
        const { tokens } = await client.getToken(code);
        if (!tokens.id_token) throw new GoogleAuthenticationError("Google did not return an ID token.");

        const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
        const payload = ticket.getPayload();
        if (!payload?.sub || !payload.email || payload.email_verified !== true || payload.nonce !== nonce) {
          throw new GoogleAuthenticationError("Google identity is missing a verified email address.");
        }

        return { subject: payload.sub, email: payload.email.trim().toLowerCase(), name: payload.name };
      } catch (error) {
        if (error instanceof GoogleAuthenticationError) throw error;
        throw new GoogleAuthenticationError("Google identity verification failed.");
      }
    },
  };
}
