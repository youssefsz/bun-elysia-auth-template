import type { AuthProviderRegistry } from "../../core/auth/auth-provider-registry";
import type { AuthProviderRepository } from "../../domains/auth/auth.types";
import type { UserRepository } from "../../domains/users/user.types";
import type { SessionService } from "../../core/auth/session.service";
import type { Logger } from "../../utils/logger";
import { AppError } from "../../utils/app-error";

interface AuthServiceDependencies {
  authProviderRegistry: AuthProviderRegistry;
  authProviderRepository: AuthProviderRepository;
  logger: Logger;
  sessionService: SessionService;
  userRepository: UserRepository;
}

export class AuthService {
  constructor(private readonly deps: AuthServiceDependencies) {}

  async getAuthenticatedSession(token: string | undefined) {
    if (!token) {
      return null;
    }

    try {
      const session = await this.deps.sessionService.verify(token);
      const user = await this.deps.userRepository.findById(session.userId);

      if (!user || user.sessionVersion !== session.sessionVersion) {
        return null;
      }

      return {
        session,
        user,
      };
    } catch {
      return null;
    }
  }

  async getAuthenticatedUser(token: string | undefined) {
    const authenticatedSession = await this.getAuthenticatedSession(token);

    return authenticatedSession?.user ?? null;
  }

  async getProviderOverview(userId: string) {
    const linkedProviders = await this.deps.authProviderRepository.listByUserId(userId);

    return {
      available: this.deps.authProviderRegistry.listAvailableProviders(),
      linked: linkedProviders.map((provider) => ({
        connectedAt: provider.createdAt,
        provider: provider.provider,
      })),
    };
  }

  async logoutAllSessions(userId: string) {
    const user = await this.deps.userRepository.incrementSessionVersion(userId);

    if (!user) {
      throw new AppError(404, "USER_NOT_FOUND", "User not found.");
    }

    this.deps.logger.info("auth.sessions.invalidated", {
      userId: user.id,
    });

    return user;
  }

  async signInWithProvider(provider: "google", credential: string) {
    const identity = await this.deps.authProviderRegistry.verify(
      provider,
      credential,
    );
    const existingProvider = await this.deps.authProviderRepository.findByProvider(
      provider,
      identity.providerUserId,
    );

    const existingUser = existingProvider
      ? await this.deps.userRepository.findById(existingProvider.userId)
      : await this.deps.userRepository.findByEmail(identity.email);

    const createdOrExistingUser =
      existingUser ??
      (await this.deps.userRepository.create({
        email: identity.email,
        emailVerified: identity.emailVerified,
        name: identity.name,
      }));

    const user = existingUser
      ? (await this.deps.userRepository.update(existingUser.id, {
          emailVerified: existingUser.emailVerified || identity.emailVerified,
          name: identity.name,
        })) ?? createdOrExistingUser
      : createdOrExistingUser;

    if (!existingProvider) {
      await this.deps.authProviderRepository.create({
        provider,
        providerUserId: identity.providerUserId,
        userId: user.id,
      });
    }

    const sessionToken = await this.deps.sessionService.sign(user);

    this.deps.logger.info("auth.provider.signed_in", {
      provider,
      userId: user.id,
    });

    return {
      sessionToken,
      user,
    };
  }
}
