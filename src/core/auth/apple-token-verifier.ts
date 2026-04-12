import { createRemoteJWKSet, jwtVerify } from "jose";
import type { AppConfig } from "../../config/env";
import type {
  AuthIdentityVerifier,
  ExternalAuthIdentity,
} from "./auth-provider-registry";
import { AppError } from "../../utils/app-error";

const APPLE_JWKS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

const APPLE_ISSUER = "https://appleid.apple.com";

export class AppleTokenVerifier implements AuthIdentityVerifier {
  readonly provider = "apple" as const;

  constructor(private readonly config: AppConfig) {}

  isEnabled() {
    return this.config.appleClientIds.length > 0;
  }

  async verify(idToken: string): Promise<ExternalAuthIdentity> {
    if (!this.isEnabled()) {
      throw new AppError(
        503,
        "APPLE_AUTH_NOT_CONFIGURED",
        "Apple authentication is not configured.",
      );
    }

    try {
      const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
        audience: this.config.appleClientIds,
        issuer: APPLE_ISSUER,
      });

      const subject = payload.sub;
      const email = typeof payload.email === "string" ? payload.email : null;
      const emailVerified =
        payload.email_verified === true || payload.email_verified === "true";

      if (!subject || !email) {
        throw new AppError(
          401,
          "INVALID_APPLE_TOKEN",
          "The Apple token is missing required claims.",
        );
      }

      return {
        email,
        emailVerified,
        name: null,
        providerUserId: subject,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(
        401,
        "INVALID_APPLE_TOKEN",
        "Apple sign-in token verification failed.",
      );
    }
  }
}
