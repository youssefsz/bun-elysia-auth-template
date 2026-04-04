export const supportedAuthProviders = ["google"] as const;

export type AuthProviderName =
  | (typeof supportedAuthProviders)[number]
  | "email"
  | "github";

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
  listByUserId(userId: string): Promise<AuthProvider[]>;
}
