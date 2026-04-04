export const supportedAuthProviders = ["email", "google"] as const;
export const supportedExternalAuthProviders = ["google"] as const;
export const authEmailDeliveryKinds = ["verification", "password_reset"] as const;
export const emailVerificationTokenKinds = ["email_verification"] as const;

export type AuthProviderName = (typeof supportedAuthProviders)[number];
export type ExternalAuthProviderName =
  (typeof supportedExternalAuthProviders)[number];
export type AuthEmailDeliveryKind = (typeof authEmailDeliveryKinds)[number];
export type EmailVerificationTokenKind =
  (typeof emailVerificationTokenKinds)[number];

export interface AuthProvider {
  createdAt: Date;
  id: string;
  provider: AuthProviderName;
  providerUserId: string;
  userId: string;
}

export interface CreateAuthProviderInput {
  provider: AuthProviderName;
  providerUserId: string;
  userId: string;
}

export interface AuthProviderRepository {
  create(input: CreateAuthProviderInput): Promise<AuthProvider>;
  deleteByUserId(userId: string): Promise<number>;
  findByProvider(
    provider: AuthProviderName,
    providerUserId: string,
  ): Promise<AuthProvider | null>;
  findByUserIdAndProvider(
    userId: string,
    provider: AuthProviderName,
  ): Promise<AuthProvider | null>;
  listByUserId(userId: string): Promise<AuthProvider[]>;
}

export interface LocalAuthCredential {
  createdAt: Date;
  emailVerifiedAt: Date | null;
  passwordHash: string;
  updatedAt: Date;
  userId: string;
}

export interface CreateLocalAuthCredentialInput {
  emailVerifiedAt?: Date | null;
  passwordHash: string;
  userId: string;
}

export interface UpdateLocalAuthCredentialInput {
  emailVerifiedAt?: Date | null;
  passwordHash?: string;
}

export interface LocalAuthCredentialRepository {
  create(input: CreateLocalAuthCredentialInput): Promise<LocalAuthCredential>;
  deleteByUserId(userId: string): Promise<boolean>;
  findByUserId(userId: string): Promise<LocalAuthCredential | null>;
  update(
    userId: string,
    input: UpdateLocalAuthCredentialInput,
  ): Promise<LocalAuthCredential | null>;
}

export interface EmailVerificationToken {
  consumedAt: Date | null;
  createdAt: Date;
  email: string;
  expiresAt: Date;
  id: string;
  kind: EmailVerificationTokenKind;
  pendingName: string | null;
  pendingPasswordHash: string;
  tokenHash: string;
  userId: string | null;
}

export interface CreateEmailVerificationTokenInput {
  email: string;
  expiresAt: Date;
  kind: EmailVerificationTokenKind;
  pendingName?: string | null;
  pendingPasswordHash: string;
  tokenHash: string;
  userId?: string | null;
}

export interface EmailVerificationTokenRepository {
  consume(id: string, consumedAt: Date): Promise<EmailVerificationToken | null>;
  create(
    input: CreateEmailVerificationTokenInput,
  ): Promise<EmailVerificationToken>;
  deleteById(id: string): Promise<boolean>;
  deleteByUserId(userId: string): Promise<number>;
  deletePendingByEmail(
    email: string,
    kind: EmailVerificationTokenKind,
  ): Promise<number>;
  findByTokenHash(
    tokenHash: string,
    kind: EmailVerificationTokenKind,
  ): Promise<EmailVerificationToken | null>;
  findLatestPendingByEmail(
    email: string,
    kind: EmailVerificationTokenKind,
    now: Date,
  ): Promise<EmailVerificationToken | null>;
}

export interface PasswordResetToken {
  consumedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  id: string;
  tokenHash: string;
  userId: string;
}

export interface CreatePasswordResetTokenInput {
  expiresAt: Date;
  tokenHash: string;
  userId: string;
}

export interface PasswordResetTokenRepository {
  consume(id: string, consumedAt: Date): Promise<PasswordResetToken | null>;
  create(input: CreatePasswordResetTokenInput): Promise<PasswordResetToken>;
  deleteById(id: string): Promise<boolean>;
  deleteByUserId(userId: string): Promise<number>;
  deletePendingByUserId(userId: string): Promise<number>;
  findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null>;
}

export interface AuthEmailDelivery {
  createdAt: Date;
  email: string;
  id: string;
  kind: AuthEmailDeliveryKind;
}

export interface CreateAuthEmailDeliveryInput {
  createdAt?: Date;
  email: string;
  kind: AuthEmailDeliveryKind;
}

export interface AuthEmailDeliveryRateLimitState {
  dailyCount: number;
  hourlyCount: number;
  latestRequestedAt: Date | null;
  oldestDailyRequestedAt: Date | null;
  oldestHourlyRequestedAt: Date | null;
}

export interface AuthEmailDeliveryRepository {
  create(input: CreateAuthEmailDeliveryInput): Promise<AuthEmailDelivery>;
  deleteByEmail(email: string): Promise<number>;
  deleteById(id: string): Promise<boolean>;
  getRateLimitState(
    email: string,
    kind: AuthEmailDeliveryKind,
    hourlyWindowStart: Date,
    dailyWindowStart: Date,
  ): Promise<AuthEmailDeliveryRateLimitState>;
}
