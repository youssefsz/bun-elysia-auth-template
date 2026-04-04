export const supportedAuthProviders = ["email", "google"] as const;
export const supportedExternalAuthProviders = ["google"] as const;
export const emailVerificationTokenKinds = ["email_verification"] as const;

export type AuthProviderName = (typeof supportedAuthProviders)[number];
export type ExternalAuthProviderName =
  (typeof supportedExternalAuthProviders)[number];
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
  findLatestPendingByEmail(
    email: string,
    kind: EmailVerificationTokenKind,
    now: Date,
  ): Promise<EmailVerificationToken | null>;
  findValidByTokenHash(
    tokenHash: string,
    kind: EmailVerificationTokenKind,
    now: Date,
  ): Promise<EmailVerificationToken | null>;
}
