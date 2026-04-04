import type { AuthProviderName } from "../../domains/auth/auth.types";
import { AppError } from "../../utils/app-error";

export interface ExternalAuthIdentity {
  email: string;
  emailVerified: boolean;
  name: string;
  providerUserId: string;
}

export interface AuthIdentityVerifier {
  isEnabled(): boolean;
  provider: AuthProviderName;
  verify(credential: string): Promise<ExternalAuthIdentity>;
}

export interface AvailableAuthProvider {
  enabled: boolean;
  provider: AuthProviderName;
}

export class AuthProviderRegistry {
  private readonly verifiers: Map<AuthProviderName, AuthIdentityVerifier>;

  constructor(verifiers: AuthIdentityVerifier[]) {
    this.verifiers = new Map(
      verifiers.map((verifier) => [verifier.provider, verifier]),
    );
  }

  listAvailableProviders(): AvailableAuthProvider[] {
    return [...this.verifiers.values()].map((verifier) => ({
      enabled: verifier.isEnabled(),
      provider: verifier.provider,
    }));
  }

  async verify(
    provider: AuthProviderName,
    credential: string,
  ): Promise<ExternalAuthIdentity> {
    const verifier = this.verifiers.get(provider);

    if (!verifier) {
      throw new AppError(
        400,
        "UNSUPPORTED_AUTH_PROVIDER",
        `Authentication provider "${provider}" is not supported.`,
      );
    }

    return verifier.verify(credential);
  }
}
