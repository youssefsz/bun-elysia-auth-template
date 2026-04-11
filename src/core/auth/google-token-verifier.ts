import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppConfig } from "../../config/env";
import type {
  AuthIdentityVerifier,
  ExternalAuthIdentity,
} from "./auth-provider-registry";
import { AppError } from "../../utils/app-error";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export class GoogleTokenVerifier implements AuthIdentityVerifier {
  readonly provider = "google" as const;

  constructor(private readonly config: AppConfig) {}

  isEnabled() {
    return this.config.googleClientIds.length > 0;
  }

  async verify(idToken: string): Promise<ExternalAuthIdentity> {
    if (!this.isEnabled()) {
      throw new AppError(
        503,
        "GOOGLE_AUTH_NOT_CONFIGURED",
        "Google authentication is not configured.",
      );
    }

    try {
      const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
        audience: this.config.googleClientIds,
        issuer: GOOGLE_ISSUERS,
      });

      const subject = payload.sub;
      const email = typeof payload.email === "string" ? payload.email : null;
      const emailVerified =
        payload.email_verified === true || payload.email_verified === "true";
      const name = typeof payload.name === "string" ? payload.name : email ?? "User";

      if (!subject || !email) {
        throw new AppError(
          401,
          "INVALID_GOOGLE_TOKEN",
          "The Google token is missing required claims.",
        );
      }

      return {
        email,
        emailVerified,
        name,
        providerUserId: subject,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        401,
        "INVALID_GOOGLE_TOKEN",
        "Google sign-in token verification failed.",
      );
    }
  }
}
