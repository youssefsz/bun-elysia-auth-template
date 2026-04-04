import type { AuthProviderRegistry } from "../../core/auth/auth-provider-registry";
import type { TransactionalEmailClient } from "../../core/email/resend-email-client";
import type {
  AuthProviderRepository,
  EmailVerificationToken,
  EmailVerificationTokenRepository,
  LocalAuthCredentialRepository,
} from "../../domains/auth/auth.types";
import type { UserRepository } from "../../domains/users/user.types";
import type { AppConfig } from "../../config/env";
import type { SessionService } from "../../core/auth/session.service";
import type { Logger } from "../../utils/logger";
import { AppError } from "../../utils/app-error";

interface AuthServiceDependencies {
  authProviderRegistry: AuthProviderRegistry;
  authProviderRepository: AuthProviderRepository;
  config: AppConfig;
  emailClient: TransactionalEmailClient;
  emailVerificationTokenRepository: EmailVerificationTokenRepository;
  localAuthCredentialRepository: LocalAuthCredentialRepository;
  logger: Logger;
  sessionService: SessionService;
  userRepository: UserRepository;
}

interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

const EMAIL_VERIFICATION_KIND = "email_verification" as const;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const deriveNameFromEmail = (email: string) => email.split("@")[0] || "User";

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");

const hashToken = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return toHex(new Uint8Array(digest));
};

const createVerificationLink = (baseUrl: string, token: string) => {
  const url = new URL("/api/v1/auth/verify-email", baseUrl);
  url.searchParams.set("token", token);

  return url.toString();
};

const buildVerificationEmail = (name: string, verificationUrl: string) => ({
  html: `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <p>Hi ${name},</p>
      <p>Confirm your email address to finish setting up your account.</p>
      <p>
        <a href="${verificationUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">
          Verify email
        </a>
      </p>
      <p>If the button does not work, open this link:</p>
      <p><a href="${verificationUrl}">${verificationUrl}</a></p>
      <p>This link expires in 24 hours.</p>
    </div>
  `.trim(),
  subject: "Verify your email address",
  text: [
    `Hi ${name},`,
    "",
    "Confirm your email address to finish setting up your account.",
    "",
    verificationUrl,
    "",
    "This link expires in 24 hours.",
  ].join("\n"),
});

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
      available: [
        {
          enabled: true,
          provider: "email" as const,
        },
        ...this.deps.authProviderRegistry.listAvailableProviders(),
      ],
      linked: linkedProviders.map((provider) => ({
        connectedAt: provider.createdAt,
        provider: provider.provider,
      })),
    };
  }

  async loginWithEmailPassword(input: { email: string; password: string }) {
    const email = normalizeEmail(input.email);
    const user = await this.deps.userRepository.findByEmail(email);

    if (!user) {
      const pendingToken =
        await this.deps.emailVerificationTokenRepository.findLatestPendingByEmail(
          email,
          EMAIL_VERIFICATION_KIND,
          new Date(),
        );

      if (pendingToken) {
        throw new AppError(
          403,
          "EMAIL_NOT_VERIFIED",
          "Verify your email before signing in.",
        );
      }

      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
      );
    }

    const credential =
      await this.deps.localAuthCredentialRepository.findByUserId(user.id);

    if (!credential) {
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
      );
    }

    const passwordMatches = await Bun.password.verify(
      input.password,
      credential.passwordHash,
    );

    if (!passwordMatches) {
      throw new AppError(
        401,
        "INVALID_CREDENTIALS",
        "Invalid email or password.",
      );
    }

    if (!user.emailVerified || !credential.emailVerifiedAt) {
      throw new AppError(
        403,
        "EMAIL_NOT_VERIFIED",
        "Verify your email before signing in.",
      );
    }

    const sessionToken = await this.deps.sessionService.sign(user);

    this.deps.logger.info("auth.email.signed_in", {
      userId: user.id,
    });

    return {
      sessionToken,
      user,
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

  async registerWithEmailPassword(
    input: RegisterInput,
    publicBaseUrl: string,
  ) {
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    const password = input.password;

    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new AppError(
        400,
        "INVALID_PASSWORD",
        `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      );
    }

    const existingUser = await this.deps.userRepository.findByEmail(email);

    if (existingUser) {
      const existingCredential =
        await this.deps.localAuthCredentialRepository.findByUserId(existingUser.id);

      if (existingCredential?.emailVerifiedAt) {
        throw new AppError(
          409,
          "EMAIL_ALREADY_IN_USE",
          "An account with that email already exists.",
        );
      }
    }

    const pendingPasswordHash = await Bun.password.hash(password);

    return this.issueVerificationToken(
      {
        email,
        pendingName: existingUser ? null : name,
        pendingPasswordHash,
        userId: existingUser?.id ?? null,
      },
      publicBaseUrl,
    );
  }

  async requestEmailVerification(email: string, publicBaseUrl: string) {
    const normalizedEmail = normalizeEmail(email);
    const existingUser = await this.deps.userRepository.findByEmail(normalizedEmail);

    if (existingUser?.emailVerified) {
      return {
        success: true,
      };
    }

    const pendingToken =
      await this.deps.emailVerificationTokenRepository.findLatestPendingByEmail(
        normalizedEmail,
        EMAIL_VERIFICATION_KIND,
        new Date(),
      );

    if (!pendingToken) {
      return {
        success: true,
      };
    }

    await this.issueVerificationToken(
      {
        email: normalizedEmail,
        pendingName: pendingToken.pendingName,
        pendingPasswordHash: pendingToken.pendingPasswordHash,
        userId: pendingToken.userId,
      },
      publicBaseUrl,
    );

    return {
      success: true,
    };
  }

  async signInWithProvider(provider: "google", credential: string) {
    const identity = await this.deps.authProviderRegistry.verify(
      provider,
      credential,
    );

    if (!identity.emailVerified) {
      throw new AppError(
        403,
        "EXTERNAL_EMAIL_NOT_VERIFIED",
        "The provider email must be verified before signing in.",
      );
    }

    const email = normalizeEmail(identity.email);
    const existingProvider = await this.deps.authProviderRepository.findByProvider(
      provider,
      identity.providerUserId,
    );

    const existingUser = existingProvider
      ? await this.deps.userRepository.findById(existingProvider.userId)
      : await this.deps.userRepository.findByEmail(email);

    const createdOrExistingUser =
      existingUser ??
      (await this.deps.userRepository.create({
        email,
        emailVerified: true,
        name: identity.name,
      }));

    const user = existingUser
      ? (await this.deps.userRepository.update(existingUser.id, {
          emailVerified: true,
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

  async verifyEmailToken(token: string) {
    const now = new Date();
    const tokenHash = await hashToken(token);
    const verificationToken =
      await this.deps.emailVerificationTokenRepository.findValidByTokenHash(
        tokenHash,
        EMAIL_VERIFICATION_KIND,
        now,
      );

    if (!verificationToken) {
      throw new AppError(
        400,
        "INVALID_VERIFICATION_TOKEN",
        "Verification token is invalid or expired.",
      );
    }

    const user =
      (verificationToken.userId
        ? await this.deps.userRepository.findById(verificationToken.userId)
        : null) ??
      (await this.deps.userRepository.findByEmail(verificationToken.email));

    const account =
      user ??
      (await this.deps.userRepository.create({
        email: verificationToken.email,
        emailVerified: true,
        name:
          verificationToken.pendingName ??
          deriveNameFromEmail(verificationToken.email),
      }));

    if (!account.emailVerified) {
      await this.deps.userRepository.update(account.id, {
        emailVerified: true,
      });
    }

    const existingCredential =
      await this.deps.localAuthCredentialRepository.findByUserId(account.id);

    if (existingCredential?.emailVerifiedAt) {
      throw new AppError(
        409,
        "EMAIL_ALREADY_IN_USE",
        "An account with that email already exists.",
      );
    }

    if (existingCredential) {
      await this.deps.localAuthCredentialRepository.update(account.id, {
        emailVerifiedAt: now,
        passwordHash: verificationToken.pendingPasswordHash,
      });
    } else {
      await this.deps.localAuthCredentialRepository.create({
        emailVerifiedAt: now,
        passwordHash: verificationToken.pendingPasswordHash,
        userId: account.id,
      });
    }

    const emailProvider =
      await this.deps.authProviderRepository.findByUserIdAndProvider(
        account.id,
        "email",
      );

    if (!emailProvider) {
      await this.deps.authProviderRepository.create({
        provider: "email",
        providerUserId: verificationToken.email,
        userId: account.id,
      });
    }

    await this.deps.emailVerificationTokenRepository.consume(
      verificationToken.id,
      now,
    );

    const refreshedUser =
      (await this.deps.userRepository.findById(account.id)) ?? account;
    const sessionToken = await this.deps.sessionService.sign(refreshedUser);

    this.deps.logger.info("auth.email.verified", {
      userId: refreshedUser.id,
    });

    return {
      sessionToken,
      user: refreshedUser,
    };
  }

  private async issueVerificationToken(
    input: {
      email: string;
      pendingName: string | null;
      pendingPasswordHash: string;
      userId: string | null;
    },
    publicBaseUrl: string,
  ) {
    if (!this.deps.emailClient.isEnabled()) {
      throw new AppError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Transactional email is not configured.",
      );
    }

    const rawToken = crypto.randomUUID();
    const tokenHash = await hashToken(rawToken);

    await this.deps.emailVerificationTokenRepository.deletePendingByEmail(
      input.email,
      EMAIL_VERIFICATION_KIND,
    );

    const verificationToken =
      await this.deps.emailVerificationTokenRepository.create({
        email: input.email,
        expiresAt: new Date(
          Date.now() + this.deps.config.emailVerificationTtlSeconds * 1000,
        ),
        kind: EMAIL_VERIFICATION_KIND,
        pendingName: input.pendingName,
        pendingPasswordHash: input.pendingPasswordHash,
        tokenHash,
        userId: input.userId,
      });

    const verificationUrl = createVerificationLink(publicBaseUrl, rawToken);
    const email = buildVerificationEmail(
      input.pendingName ?? deriveNameFromEmail(input.email),
      verificationUrl,
    );

    try {
      await this.deps.emailClient.sendEmail({
        html: email.html,
        idempotencyKey: verificationToken.id,
        subject: email.subject,
        text: email.text,
        to: input.email,
      });
    } catch (error) {
      await this.deps.emailVerificationTokenRepository.deleteById(
        verificationToken.id,
      );
      throw error;
    }

    this.deps.logger.info("auth.email_verification.sent", {
      email: input.email,
      userId: input.userId,
    });

    return {
      success: true,
    };
  }
}
