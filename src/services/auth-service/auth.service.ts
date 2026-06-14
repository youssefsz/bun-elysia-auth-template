import type { AppConfig } from "../../config/env";
import type { AuthProviderRegistry } from "../../core/auth/auth-provider-registry";
import type { SessionService } from "../../core/auth/session.service";
import type { TransactionalEmailClient } from "../../core/email/resend-email-client";
import type {
  AuthEmailDeliveryKind,
  AuthEmailDeliveryRateLimitState,
  AuthEmailDeliveryRepository,
  AuthProviderRepository,
  EmailVerificationTokenRepository,
  LocalAuthCredentialRepository,
  PasswordResetTokenRepository,
} from "../../domains/auth/auth.types";
import type { UserRepository } from "../../domains/users/user.types";
import { AppError } from "../../utils/app-error";
import type { Logger } from "../../utils/logger";

interface AuthServiceDependencies {
  authEmailDeliveryRepository: AuthEmailDeliveryRepository;
  authProviderRegistry: AuthProviderRegistry;
  authProviderRepository: AuthProviderRepository;
  config: AppConfig;
  emailClient: TransactionalEmailClient;
  emailVerificationTokenRepository: EmailVerificationTokenRepository;
  localAuthCredentialRepository: LocalAuthCredentialRepository;
  logger: Logger;
  passwordResetTokenRepository: PasswordResetTokenRepository;
  sessionService: SessionService;
  userRepository: UserRepository;
}

interface RegisterInput {
  email: string;
  name: string;
  password: string;
}

interface PasswordResetConfirmInput {
  password: string;
  token: string;
}

interface ExternalProviderProfileInput {
  name?: string;
}

interface EmailDeliveryMetadata {
  requestedAt: string;
  resendAvailableAt: string;
  retryAfterSeconds: number;
}

interface EmailDeliveryAvailability {
  requestedAt: Date;
  resendAvailableAt: Date;
  retryAfterSeconds: number;
}

interface VerificationEmailResponse {
  success: true;
  verificationEmail: EmailDeliveryMetadata;
}

interface PasswordResetEmailResponse {
  success: true;
  passwordResetEmail: EmailDeliveryMetadata;
}

interface VerifyEmailVerifiedResult {
  sessionToken: string;
  status: "verified";
  user: Awaited<ReturnType<UserRepository["findById"]>> extends infer T
    ? Exclude<T, null>
    : never;
}

interface VerifyEmailAlreadyVerifiedResult {
  status: "already_verified";
}

type VerifyEmailResult =
  | VerifyEmailAlreadyVerifiedResult
  | VerifyEmailVerifiedResult;

const EMAIL_VERIFICATION_KIND = "email_verification" as const;
const EMAIL_VERIFICATION_DELIVERY_KIND = "verification" as const;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_RESET_DELIVERY_KIND = "password_reset" as const;
const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const deriveNameFromEmail = (email: string) => email.split("@")[0] || "User";

const normalizeOptionalName = (value: string | null | undefined) => {
  const normalized = value?.trim();

  return normalized ? normalized : null;
};

const toHex = (bytes: Uint8Array) =>
  [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");

const toBase64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const createRandomToken = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return toBase64Url(bytes);
};

const hashToken = async (value: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );

  return toHex(new Uint8Array(digest));
};

const createEmailLink = (baseUrl: string, path: string, token: string) => {
  const url = new URL(path, `${baseUrl.replace(/\/$/, "")}/`);
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

const buildPasswordResetEmail = (name: string, resetUrl: string) => ({
  html: `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
      <p>Hi ${name},</p>
      <p>We received a request to reset your password.</p>
      <p>
        <a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#111827;color:#ffffff;text-decoration:none;border-radius:8px;">
          Reset password
        </a>
      </p>
      <p>If the button does not work, open this link:</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>This link expires in 1 hour.</p>
    </div>
  `.trim(),
  subject: "Reset your password",
  text: [
    `Hi ${name},`,
    "",
    "We received a request to reset your password.",
    "",
    resetUrl,
    "",
    "This link expires in 1 hour.",
  ].join("\n"),
});

const addSeconds = (value: Date, seconds: number) =>
  new Date(value.getTime() + seconds * 1000);

const calculateResendAvailability = (
  state: AuthEmailDeliveryRateLimitState,
  config: AppConfig,
  now: Date,
): EmailDeliveryAvailability => {
  const cooldownAvailableAt = state.latestRequestedAt
    ? addSeconds(state.latestRequestedAt, config.authEmailResendCooldownSeconds)
    : now;
  const hourlyAvailableAt =
    state.hourlyCount >= config.authEmailMaxPerHour &&
    state.oldestHourlyRequestedAt
      ? new Date(state.oldestHourlyRequestedAt.getTime() + HOUR_IN_MS)
      : now;
  const dailyAvailableAt =
    state.dailyCount >= config.authEmailMaxPerDay &&
    state.oldestDailyRequestedAt
      ? new Date(state.oldestDailyRequestedAt.getTime() + DAY_IN_MS)
      : now;
  const resendAvailableAt = new Date(
    Math.max(
      now.getTime(),
      cooldownAvailableAt.getTime(),
      hourlyAvailableAt.getTime(),
      dailyAvailableAt.getTime(),
    ),
  );

  return {
    requestedAt: state.latestRequestedAt ?? now,
    resendAvailableAt,
    retryAfterSeconds: Math.max(
      0,
      Math.ceil((resendAvailableAt.getTime() - now.getTime()) / 1000),
    ),
  };
};

const applyRecordedDelivery = (
  state: AuthEmailDeliveryRateLimitState,
  requestedAt: Date,
): AuthEmailDeliveryRateLimitState => ({
  dailyCount: state.dailyCount + 1,
  hourlyCount: state.hourlyCount + 1,
  latestRequestedAt: requestedAt,
  oldestDailyRequestedAt: state.oldestDailyRequestedAt ?? requestedAt,
  oldestHourlyRequestedAt: state.oldestHourlyRequestedAt ?? requestedAt,
});

const toEmailDeliveryMetadata = (
  availability: EmailDeliveryAvailability,
): EmailDeliveryMetadata => ({
  requestedAt: availability.requestedAt.toISOString(),
  resendAvailableAt: availability.resendAvailableAt.toISOString(),
  retryAfterSeconds: availability.retryAfterSeconds,
});

const toPasswordResetEmailResponse = (
  availability: EmailDeliveryAvailability,
): PasswordResetEmailResponse => ({
  passwordResetEmail: toEmailDeliveryMetadata(availability),
  success: true,
});

const toVerificationEmailResponse = (
  availability: EmailDeliveryAvailability,
): VerificationEmailResponse => ({
  success: true,
  verificationEmail: toEmailDeliveryMetadata(availability),
});

const createImmediateAvailability = (now: Date): EmailDeliveryAvailability => ({
  requestedAt: now,
  resendAvailableAt: now,
  retryAfterSeconds: 0,
});

export class AuthService {
  constructor(private readonly deps: AuthServiceDependencies) {}

  private requireAuthLinkBaseUrl() {
    const baseUrl =
      this.deps.config.frontendPublicUrl ?? this.deps.config.appPublicUrl;

    if (baseUrl) {
      return baseUrl;
    }

    throw new AppError(
      503,
      "PUBLIC_URL_NOT_CONFIGURED",
      "APP_PUBLIC_URL or FRONTEND_PUBLIC_URL must be configured before sending auth emails.",
    );
  }

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
  ): Promise<VerificationEmailResponse> {
    const now = new Date();
    const email = normalizeEmail(input.email);
    const name = input.name.trim();
    const password = input.password;

    this.assertPasswordLength(password);

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

    const delivery = await this.beginAuthEmailDelivery(
      email,
      EMAIL_VERIFICATION_DELIVERY_KIND,
      now,
    );

    if (!delivery.requestId) {
      return toVerificationEmailResponse(delivery.availability);
    }

    const pendingPasswordHash = await Bun.password.hash(password);

    try {
      await this.deliverVerificationToken(
        {
          email,
          pendingName: existingUser ? null : name,
          pendingPasswordHash,
          userId: existingUser?.id ?? null,
        },
      );
    } catch (error) {
      await this.deps.authEmailDeliveryRepository.deleteById(delivery.requestId);
      throw error;
    }

    return toVerificationEmailResponse(delivery.availability);
  }

  async requestEmailVerification(
    email: string,
  ): Promise<VerificationEmailResponse> {
    const now = new Date();
    const normalizedEmail = normalizeEmail(email);
    const existingUser = await this.deps.userRepository.findByEmail(normalizedEmail);

    if (existingUser?.emailVerified) {
      return toVerificationEmailResponse(createImmediateAvailability(now));
    }

    const delivery = await this.beginAuthEmailDelivery(
      normalizedEmail,
      EMAIL_VERIFICATION_DELIVERY_KIND,
      now,
    );

    if (!delivery.requestId) {
      return toVerificationEmailResponse(delivery.availability);
    }

    const pendingToken =
      await this.deps.emailVerificationTokenRepository.findLatestPendingByEmail(
        normalizedEmail,
        EMAIL_VERIFICATION_KIND,
        now,
      );

    if (!pendingToken) {
      return toVerificationEmailResponse(delivery.availability);
    }

    try {
      await this.deliverVerificationToken(
        {
          email: normalizedEmail,
          pendingName: pendingToken.pendingName,
          pendingPasswordHash: pendingToken.pendingPasswordHash,
          userId: pendingToken.userId,
        },
      );
    } catch (error) {
      await this.deps.authEmailDeliveryRepository.deleteById(delivery.requestId);
      throw error;
    }

    return toVerificationEmailResponse(delivery.availability);
  }

  async requestPasswordReset(
    email: string,
  ): Promise<PasswordResetEmailResponse> {
    const now = new Date();
    const normalizedEmail = normalizeEmail(email);
    const delivery = await this.beginAuthEmailDelivery(
      normalizedEmail,
      PASSWORD_RESET_DELIVERY_KIND,
      now,
    );

    if (!delivery.requestId) {
      return toPasswordResetEmailResponse(delivery.availability);
    }

    const user = await this.deps.userRepository.findByEmail(normalizedEmail);

    if (!user?.emailVerified) {
      return toPasswordResetEmailResponse(delivery.availability);
    }

    const credential =
      await this.deps.localAuthCredentialRepository.findByUserId(user.id);

    if (!credential?.emailVerifiedAt) {
      return toPasswordResetEmailResponse(delivery.availability);
    }

    try {
      await this.deliverPasswordResetToken(
        {
          email: user.email,
          name: user.name,
          userId: user.id,
        },
      );
    } catch (error) {
      await this.deps.authEmailDeliveryRepository.deleteById(delivery.requestId);
      throw error;
    }

    return toPasswordResetEmailResponse(delivery.availability);
  }

  async resetPasswordWithToken(input: PasswordResetConfirmInput) {
    this.assertPasswordLength(input.password);

    const now = new Date();
    const tokenHash = await hashToken(input.token);
    const tokenRecord =
      await this.deps.passwordResetTokenRepository.findByTokenHash(tokenHash);

    if (!tokenRecord || tokenRecord.consumedAt) {
      throw new AppError(
        400,
        "INVALID_PASSWORD_RESET_TOKEN",
        "Password reset token is invalid.",
      );
    }

    if (tokenRecord.expiresAt.getTime() <= now.getTime()) {
      throw new AppError(
        409,
        "PASSWORD_RESET_TOKEN_EXPIRED",
        "Password reset token has expired.",
      );
    }

    const user = await this.deps.userRepository.findById(tokenRecord.userId);
    const credential =
      user &&
      (await this.deps.localAuthCredentialRepository.findByUserId(tokenRecord.userId));

    if (!user || !credential) {
      throw new AppError(
        400,
        "INVALID_PASSWORD_RESET_TOKEN",
        "Password reset token is invalid.",
      );
    }

    const passwordHash = await Bun.password.hash(input.password);

    await this.deps.localAuthCredentialRepository.update(user.id, {
      passwordHash,
    });
    await this.deps.passwordResetTokenRepository.consume(tokenRecord.id, now);
    await this.deps.passwordResetTokenRepository.deletePendingByUserId(user.id);
    await this.deps.userRepository.incrementSessionVersion(user.id);

    this.deps.logger.info("auth.password_reset.completed", {
      userId: user.id,
    });

    return {
      success: true,
    };
  }

  async signInWithProvider(
    provider: "google" | "apple",
    credential: string,
    profile: ExternalProviderProfileInput = {},
  ) {
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
    const preferredName =
      normalizeOptionalName(profile.name) ?? normalizeOptionalName(identity.name);
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
        name: preferredName ?? deriveNameFromEmail(email),
      }));

    const user = existingUser
      ? (await this.deps.userRepository.update(existingUser.id, {
          emailVerified: true,
          name:
            preferredName && preferredName !== existingUser.name
              ? preferredName
              : undefined,
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

  async verifyEmailToken(token: string): Promise<VerifyEmailResult> {
    const now = new Date();
    const tokenHash = await hashToken(token);
    const verificationToken =
      await this.deps.emailVerificationTokenRepository.findByTokenHash(
        tokenHash,
        EMAIL_VERIFICATION_KIND,
      );

    if (!verificationToken) {
      throw new AppError(
        400,
        "INVALID_VERIFICATION_TOKEN",
        "Verification token is invalid.",
      );
    }

    const existingUser =
      (verificationToken.userId
        ? await this.deps.userRepository.findById(verificationToken.userId)
        : null) ??
      (await this.deps.userRepository.findByEmail(verificationToken.email));

    if (existingUser) {
      const existingCredential =
        await this.deps.localAuthCredentialRepository.findByUserId(existingUser.id);

      if (existingUser.emailVerified || existingCredential?.emailVerifiedAt) {
        if (!verificationToken.consumedAt) {
          await this.deps.emailVerificationTokenRepository.consume(
            verificationToken.id,
            now,
          );
        }

        return {
          status: "already_verified",
        };
      }
    }

    if (verificationToken.consumedAt) {
      return {
        status: "already_verified",
      };
    }

    if (verificationToken.expiresAt.getTime() <= now.getTime()) {
      throw new AppError(
        409,
        "EMAIL_VERIFICATION_TOKEN_EXPIRED",
        "Verification token has expired.",
      );
    }

    const account =
      existingUser ??
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
      status: "verified",
      user: refreshedUser,
    };
  }

  private assertPasswordLength(password: string) {
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new AppError(
        400,
        "INVALID_PASSWORD",
        `Password must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
      );
    }
  }

  private async beginAuthEmailDelivery(
    email: string,
    kind: AuthEmailDeliveryKind,
    now: Date,
  ) {
    const rateLimitState = await this.deps.authEmailDeliveryRepository.getRateLimitState(
      email,
      kind,
      new Date(now.getTime() - HOUR_IN_MS),
      new Date(now.getTime() - DAY_IN_MS),
    );
    const availability = calculateResendAvailability(
      rateLimitState,
      this.deps.config,
      now,
    );

    if (availability.retryAfterSeconds > 0 && rateLimitState.latestRequestedAt) {
      this.deps.logger.info("auth.email_delivery.deferred", {
        email,
        kind,
        resendAvailableAt: availability.resendAvailableAt.toISOString(),
        retryAfterSeconds: availability.retryAfterSeconds,
      });

      return {
        availability,
        requestId: null,
      };
    }

    const delivery = await this.deps.authEmailDeliveryRepository.create({
      createdAt: now,
      email,
      kind,
    });
    const nextAvailability = calculateResendAvailability(
      applyRecordedDelivery(rateLimitState, delivery.createdAt),
      this.deps.config,
      now,
    );

    return {
      availability: nextAvailability,
      requestId: delivery.id,
    };
  }

  private async deliverPasswordResetToken(
    input: {
      email: string;
      name: string;
      userId: string;
    },
  ) {
    if (!this.deps.emailClient.isEnabled()) {
      throw new AppError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Transactional email is not configured.",
      );
    }

    const rawToken = createRandomToken();
    const tokenHash = await hashToken(rawToken);

    await this.deps.passwordResetTokenRepository.deletePendingByUserId(input.userId);

    const passwordResetToken = await this.deps.passwordResetTokenRepository.create({
      expiresAt: new Date(
        Date.now() + this.deps.config.passwordResetTtlSeconds * 1000,
      ),
      tokenHash,
      userId: input.userId,
    });

    const resetUrl = createEmailLink(
      this.requireAuthLinkBaseUrl(),
      this.deps.config.frontendPublicUrl
        ? this.deps.config.passwordResetFrontendPath
        : "/reset-password",
      rawToken,
    );
    const email = buildPasswordResetEmail(input.name, resetUrl);

    try {
      await this.deps.emailClient.sendEmail({
        html: email.html,
        idempotencyKey: passwordResetToken.id,
        subject: email.subject,
        text: email.text,
        to: input.email,
      });
    } catch (error) {
      await this.deps.passwordResetTokenRepository.deleteById(passwordResetToken.id);
      throw error;
    }

    this.deps.logger.info("auth.password_reset.sent", {
      userId: input.userId,
    });
  }

  private async deliverVerificationToken(
    input: {
      email: string;
      pendingName: string | null;
      pendingPasswordHash: string;
      userId: string | null;
    },
  ) {
    if (!this.deps.emailClient.isEnabled()) {
      throw new AppError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Transactional email is not configured.",
      );
    }

    const rawToken = createRandomToken();
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

    const verificationUrl = createEmailLink(
      this.requireAuthLinkBaseUrl(),
      this.deps.config.frontendPublicUrl
        ? this.deps.config.emailVerificationFrontendPath
        : "/api/v1/auth/verify-email",
      rawToken,
    );
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
  }
}
