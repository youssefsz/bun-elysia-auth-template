import { and, asc, desc, eq, gt, gte, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  authEmailDeliveriesTable,
  authProvidersTable,
  emailVerificationTokensTable,
  localAuthCredentialsTable,
  passwordResetTokensTable,
  usersTable,
} from "../../db/schema";
import type {
  AuthEmailDelivery,
  AuthEmailDeliveryKind,
  AuthEmailDeliveryRateLimitState,
  AuthEmailDeliveryRepository,
  AuthProvider,
  AuthProviderName,
  AuthProviderRepository,
  CreateAuthEmailDeliveryInput,
  CreateAuthProviderInput,
  CreateEmailVerificationTokenInput,
  CreateLocalAuthCredentialInput,
  EmailVerificationToken,
  EmailVerificationTokenKind,
  EmailVerificationTokenRepository,
  LocalAuthCredential,
  LocalAuthCredentialRepository,
  PasswordResetToken,
  PasswordResetTokenRepository,
  UpdateLocalAuthCredentialInput,
} from "../../domains/auth/auth.types";
import type {
  CreateUserInput,
  UpdateUserInput,
  User,
  UserRepository,
} from "../../domains/users/user.types";
import { createId } from "../../utils/ids";
import type { Logger } from "../../utils/logger";
import type * as schema from "../../db/schema";

type Database = PostgresJsDatabase<typeof schema>;

const mapUser = (row: typeof usersTable.$inferSelect): User => ({
  createdAt: row.createdAt,
  email: row.email,
  emailVerified: row.emailVerified,
  id: row.id,
  name: row.name,
  sessionVersion: row.sessionVersion,
  updatedAt: row.updatedAt,
});

const mapAuthProvider = (
  row: typeof authProvidersTable.$inferSelect,
): AuthProvider => ({
  createdAt: row.createdAt,
  id: row.id,
  provider: row.provider as AuthProviderName,
  providerUserId: row.providerUserId,
  userId: row.userId,
});

const mapLocalAuthCredential = (
  row: typeof localAuthCredentialsTable.$inferSelect,
): LocalAuthCredential => ({
  createdAt: row.createdAt,
  emailVerifiedAt: row.emailVerifiedAt,
  passwordHash: row.passwordHash,
  updatedAt: row.updatedAt,
  userId: row.userId,
});

const mapEmailVerificationToken = (
  row: typeof emailVerificationTokensTable.$inferSelect,
): EmailVerificationToken => ({
  consumedAt: row.consumedAt,
  createdAt: row.createdAt,
  email: row.email,
  expiresAt: row.expiresAt,
  id: row.id,
  kind: row.kind as EmailVerificationTokenKind,
  pendingName: row.pendingName,
  pendingPasswordHash: row.pendingPasswordHash,
  tokenHash: row.tokenHash,
  userId: row.userId,
});

const mapAuthEmailDelivery = (
  row: typeof authEmailDeliveriesTable.$inferSelect,
): AuthEmailDelivery => ({
  createdAt: row.createdAt,
  email: row.email,
  id: row.id,
  kind: row.kind as AuthEmailDeliveryKind,
});

const mapPasswordResetToken = (
  row: typeof passwordResetTokensTable.$inferSelect,
): PasswordResetToken => ({
  consumedAt: row.consumedAt,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  id: row.id,
  tokenHash: row.tokenHash,
  userId: row.userId,
});

class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateUserInput): Promise<User> {
    const [row] = await this.db
      .insert(usersTable)
      .values({
        email: input.email,
        emailVerified: input.emailVerified,
        id: createId("user"),
        name: input.name,
        sessionVersion: input.sessionVersion ?? 1,
      })
      .returning();

    return mapUser(row);
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(usersTable)
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id });

    return rows.length > 0;
  }

  async findByEmail(email: string): Promise<User | null> {
    const row = await this.db.query.usersTable.findFirst({
      where: eq(usersTable.email, email),
    });

    return row ? mapUser(row) : null;
  }

  async findById(id: string): Promise<User | null> {
    const row = await this.db.query.usersTable.findFirst({
      where: eq(usersTable.id, id),
    });

    return row ? mapUser(row) : null;
  }

  async incrementSessionVersion(id: string): Promise<User | null> {
    const current = await this.findById(id);

    if (!current) {
      return null;
    }

    const [row] = await this.db
      .update(usersTable)
      .set({
        sessionVersion: current.sessionVersion + 1,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, id))
      .returning();

    return row ? mapUser(row) : null;
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const [row] = await this.db
      .update(usersTable)
      .set({
        emailVerified: input.emailVerified,
        name: input.name,
        sessionVersion: input.sessionVersion,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, id))
      .returning();

    return row ? mapUser(row) : null;
  }
}

class DrizzleAuthProviderRepository implements AuthProviderRepository {
  constructor(private readonly db: Database) {}

  async create(input: CreateAuthProviderInput): Promise<AuthProvider> {
    const [row] = await this.db
      .insert(authProvidersTable)
      .values({
        id: createId("auth"),
        provider: input.provider,
        providerUserId: input.providerUserId,
        userId: input.userId,
      })
      .returning();

    return mapAuthProvider(row);
  }

  async deleteByUserId(userId: string): Promise<number> {
    const rows = await this.db
      .delete(authProvidersTable)
      .where(eq(authProvidersTable.userId, userId))
      .returning({ id: authProvidersTable.id });

    return rows.length;
  }

  async findByProvider(
    provider: AuthProviderName,
    providerUserId: string,
  ): Promise<AuthProvider | null> {
    const row = await this.db.query.authProvidersTable.findFirst({
      where: and(
        eq(authProvidersTable.provider, provider),
        eq(authProvidersTable.providerUserId, providerUserId),
      ),
    });

    return row ? mapAuthProvider(row) : null;
  }

  async findByUserIdAndProvider(
    userId: string,
    provider: AuthProviderName,
  ): Promise<AuthProvider | null> {
    const row = await this.db.query.authProvidersTable.findFirst({
      where: and(
        eq(authProvidersTable.userId, userId),
        eq(authProvidersTable.provider, provider),
      ),
    });

    return row ? mapAuthProvider(row) : null;
  }

  async listByUserId(userId: string): Promise<AuthProvider[]> {
    const rows = await this.db.query.authProvidersTable.findMany({
      orderBy: (table, { asc }) => asc(table.createdAt),
      where: eq(authProvidersTable.userId, userId),
    });

    return rows.map(mapAuthProvider);
  }
}

class DrizzleLocalAuthCredentialRepository
  implements LocalAuthCredentialRepository
{
  constructor(private readonly db: Database) {}

  async create(
    input: CreateLocalAuthCredentialInput,
  ): Promise<LocalAuthCredential> {
    const [row] = await this.db
      .insert(localAuthCredentialsTable)
      .values({
        emailVerifiedAt: input.emailVerifiedAt ?? null,
        passwordHash: input.passwordHash,
        userId: input.userId,
      })
      .returning();

    return mapLocalAuthCredential(row);
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    const rows = await this.db
      .delete(localAuthCredentialsTable)
      .where(eq(localAuthCredentialsTable.userId, userId))
      .returning({ userId: localAuthCredentialsTable.userId });

    return rows.length > 0;
  }

  async findByUserId(userId: string): Promise<LocalAuthCredential | null> {
    const row = await this.db.query.localAuthCredentialsTable.findFirst({
      where: eq(localAuthCredentialsTable.userId, userId),
    });

    return row ? mapLocalAuthCredential(row) : null;
  }

  async update(
    userId: string,
    input: UpdateLocalAuthCredentialInput,
  ): Promise<LocalAuthCredential | null> {
    const [row] = await this.db
      .update(localAuthCredentialsTable)
      .set({
        emailVerifiedAt: input.emailVerifiedAt,
        passwordHash: input.passwordHash,
        updatedAt: new Date(),
      })
      .where(eq(localAuthCredentialsTable.userId, userId))
      .returning();

    return row ? mapLocalAuthCredential(row) : null;
  }
}

class DrizzleEmailVerificationTokenRepository
  implements EmailVerificationTokenRepository
{
  constructor(private readonly db: Database) {}

  async consume(id: string, consumedAt: Date) {
    const [row] = await this.db
      .update(emailVerificationTokensTable)
      .set({
        consumedAt,
      })
      .where(eq(emailVerificationTokensTable.id, id))
      .returning();

    return row ? mapEmailVerificationToken(row) : null;
  }

  async create(
    input: CreateEmailVerificationTokenInput,
  ): Promise<EmailVerificationToken> {
    const [row] = await this.db
      .insert(emailVerificationTokensTable)
      .values({
        email: input.email,
        expiresAt: input.expiresAt,
        id: createId("verify"),
        kind: input.kind,
        pendingName: input.pendingName ?? null,
        pendingPasswordHash: input.pendingPasswordHash,
        tokenHash: input.tokenHash,
        userId: input.userId ?? null,
      })
      .returning();

    return mapEmailVerificationToken(row);
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(emailVerificationTokensTable)
      .where(eq(emailVerificationTokensTable.id, id))
      .returning({ id: emailVerificationTokensTable.id });

    return rows.length > 0;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const rows = await this.db
      .delete(emailVerificationTokensTable)
      .where(eq(emailVerificationTokensTable.userId, userId))
      .returning({ id: emailVerificationTokensTable.id });

    return rows.length;
  }

  async deletePendingByEmail(email: string, kind: EmailVerificationTokenKind) {
    const rows = await this.db
      .delete(emailVerificationTokensTable)
      .where(
        and(
          eq(emailVerificationTokensTable.email, email),
          eq(emailVerificationTokensTable.kind, kind),
          isNull(emailVerificationTokensTable.consumedAt),
        ),
      )
      .returning({ id: emailVerificationTokensTable.id });

    return rows.length;
  }

  async findLatestPendingByEmail(
    email: string,
    kind: EmailVerificationTokenKind,
    now: Date,
  ) {
    const row = await this.db.query.emailVerificationTokensTable.findFirst({
      orderBy: [desc(emailVerificationTokensTable.createdAt)],
      where: and(
        eq(emailVerificationTokensTable.email, email),
        eq(emailVerificationTokensTable.kind, kind),
        isNull(emailVerificationTokensTable.consumedAt),
        gt(emailVerificationTokensTable.expiresAt, now),
      ),
    });

    return row ? mapEmailVerificationToken(row) : null;
  }

  async findByTokenHash(
    tokenHash: string,
    kind: EmailVerificationTokenKind,
  ) {
    const row = await this.db.query.emailVerificationTokensTable.findFirst({
      where: and(
        eq(emailVerificationTokensTable.tokenHash, tokenHash),
        eq(emailVerificationTokensTable.kind, kind),
      ),
    });

    return row ? mapEmailVerificationToken(row) : null;
  }
}

class DrizzlePasswordResetTokenRepository implements PasswordResetTokenRepository
{
  constructor(private readonly db: Database) {}

  async consume(id: string, consumedAt: Date) {
    const [row] = await this.db
      .update(passwordResetTokensTable)
      .set({
        consumedAt,
      })
      .where(eq(passwordResetTokensTable.id, id))
      .returning();

    return row ? mapPasswordResetToken(row) : null;
  }

  async create(
    input: {
      expiresAt: Date;
      tokenHash: string;
      userId: string;
    },
  ): Promise<PasswordResetToken> {
    const [row] = await this.db
      .insert(passwordResetTokensTable)
      .values({
        expiresAt: input.expiresAt,
        id: createId("reset"),
        tokenHash: input.tokenHash,
        userId: input.userId,
      })
      .returning();

    return mapPasswordResetToken(row);
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.id, id))
      .returning({ id: passwordResetTokensTable.id });

    return rows.length > 0;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const rows = await this.db
      .delete(passwordResetTokensTable)
      .where(eq(passwordResetTokensTable.userId, userId))
      .returning({ id: passwordResetTokensTable.id });

    return rows.length;
  }

  async deletePendingByUserId(userId: string): Promise<number> {
    const rows = await this.db
      .delete(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.userId, userId),
          isNull(passwordResetTokensTable.consumedAt),
        ),
      )
      .returning({ id: passwordResetTokensTable.id });

    return rows.length;
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    const row = await this.db.query.passwordResetTokensTable.findFirst({
      where: eq(passwordResetTokensTable.tokenHash, tokenHash),
    });

    return row ? mapPasswordResetToken(row) : null;
  }
}

class DrizzleAuthEmailDeliveryRepository implements AuthEmailDeliveryRepository {
  constructor(private readonly db: Database) {}

  async create(
    input: CreateAuthEmailDeliveryInput,
  ): Promise<AuthEmailDelivery> {
    const [row] = await this.db
      .insert(authEmailDeliveriesTable)
      .values({
        createdAt: input.createdAt,
        email: input.email,
        id: createId("auth_email"),
        kind: input.kind,
      })
      .returning();

    return mapAuthEmailDelivery(row);
  }

  async deleteByEmail(email: string): Promise<number> {
    const rows = await this.db
      .delete(authEmailDeliveriesTable)
      .where(eq(authEmailDeliveriesTable.email, email))
      .returning({ id: authEmailDeliveriesTable.id });

    return rows.length;
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(authEmailDeliveriesTable)
      .where(eq(authEmailDeliveriesTable.id, id))
      .returning({ id: authEmailDeliveriesTable.id });

    return rows.length > 0;
  }

  async getRateLimitState(
    email: string,
    kind: AuthEmailDeliveryKind,
    hourlyWindowStart: Date,
    dailyWindowStart: Date,
  ): Promise<AuthEmailDeliveryRateLimitState> {
    const rows = await this.db
      .select({
        createdAt: authEmailDeliveriesTable.createdAt,
      })
      .from(authEmailDeliveriesTable)
      .where(
        and(
          eq(authEmailDeliveriesTable.email, email),
          eq(authEmailDeliveriesTable.kind, kind),
          gte(authEmailDeliveriesTable.createdAt, dailyWindowStart),
        ),
      )
      .orderBy(asc(authEmailDeliveriesTable.createdAt));

    const hourlyRows = rows.filter(
      (row) => row.createdAt.getTime() >= hourlyWindowStart.getTime(),
    );

    return {
      dailyCount: rows.length,
      hourlyCount: hourlyRows.length,
      latestRequestedAt:
        rows.length > 0 ? rows[rows.length - 1]!.createdAt : null,
      oldestDailyRequestedAt: rows[0]?.createdAt ?? null,
      oldestHourlyRequestedAt: hourlyRows[0]?.createdAt ?? null,
    };
  }
}

class InMemoryUserRepository implements UserRepository {
  constructor(private readonly store = new Map<string, User>()) {}

  async create(input: CreateUserInput): Promise<User> {
    const now = new Date();
    const user: User = {
      createdAt: now,
      email: input.email,
      emailVerified: input.emailVerified,
      id: createId("user"),
      name: input.name,
      sessionVersion: input.sessionVersion ?? 1,
      updatedAt: now,
    };

    this.store.set(user.id, user);

    return user;
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const user of this.store.values()) {
      if (user.email === email) {
        return user;
      }
    }

    return null;
  }

  async findById(id: string): Promise<User | null> {
    return this.store.get(id) ?? null;
  }

  async incrementSessionVersion(id: string): Promise<User | null> {
    const current = this.store.get(id);

    if (!current) {
      return null;
    }

    const next: User = {
      ...current,
      sessionVersion: current.sessionVersion + 1,
      updatedAt: new Date(),
    };

    this.store.set(id, next);

    return next;
  }

  async update(id: string, input: UpdateUserInput): Promise<User | null> {
    const current = this.store.get(id);

    if (!current) {
      return null;
    }

    const next: User = {
      ...current,
      emailVerified: input.emailVerified ?? current.emailVerified,
      name: input.name ?? current.name,
      sessionVersion: input.sessionVersion ?? current.sessionVersion,
      updatedAt: new Date(),
    };

    this.store.set(id, next);

    return next;
  }
}

class InMemoryAuthProviderRepository implements AuthProviderRepository {
  constructor(private readonly store = new Map<string, AuthProvider>()) {}

  async create(input: CreateAuthProviderInput): Promise<AuthProvider> {
    const provider: AuthProvider = {
      createdAt: new Date(),
      id: createId("auth"),
      provider: input.provider,
      providerUserId: input.providerUserId,
      userId: input.userId,
    };

    this.store.set(provider.id, provider);

    return provider;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const ids = [...this.store.values()]
      .filter((provider) => provider.userId === userId)
      .map((provider) => provider.id);

    for (const id of ids) {
      this.store.delete(id);
    }

    return ids.length;
  }

  async findByProvider(
    provider: AuthProviderName,
    providerUserId: string,
  ): Promise<AuthProvider | null> {
    for (const authProvider of this.store.values()) {
      if (
        authProvider.provider === provider &&
        authProvider.providerUserId === providerUserId
      ) {
        return authProvider;
      }
    }

    return null;
  }

  async findByUserIdAndProvider(
    userId: string,
    provider: AuthProviderName,
  ): Promise<AuthProvider | null> {
    for (const authProvider of this.store.values()) {
      if (authProvider.userId === userId && authProvider.provider === provider) {
        return authProvider;
      }
    }

    return null;
  }

  async listByUserId(userId: string): Promise<AuthProvider[]> {
    return [...this.store.values()]
      .filter((provider) => provider.userId === userId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }
}

class InMemoryLocalAuthCredentialRepository
  implements LocalAuthCredentialRepository
{
  constructor(
    private readonly store = new Map<string, LocalAuthCredential>(),
  ) {}

  async create(
    input: CreateLocalAuthCredentialInput,
  ): Promise<LocalAuthCredential> {
    const now = new Date();
    const credential: LocalAuthCredential = {
      createdAt: now,
      emailVerifiedAt: input.emailVerifiedAt ?? null,
      passwordHash: input.passwordHash,
      updatedAt: now,
      userId: input.userId,
    };

    this.store.set(credential.userId, credential);

    return credential;
  }

  async deleteByUserId(userId: string): Promise<boolean> {
    return this.store.delete(userId);
  }

  async findByUserId(userId: string): Promise<LocalAuthCredential | null> {
    return this.store.get(userId) ?? null;
  }

  async update(
    userId: string,
    input: UpdateLocalAuthCredentialInput,
  ): Promise<LocalAuthCredential | null> {
    const current = this.store.get(userId);

    if (!current) {
      return null;
    }

    const next: LocalAuthCredential = {
      ...current,
      emailVerifiedAt: input.emailVerifiedAt ?? current.emailVerifiedAt,
      passwordHash: input.passwordHash ?? current.passwordHash,
      updatedAt: new Date(),
    };

    this.store.set(userId, next);

    return next;
  }
}

class InMemoryEmailVerificationTokenRepository
  implements EmailVerificationTokenRepository
{
  constructor(
    private readonly store = new Map<string, EmailVerificationToken>(),
  ) {}

  async consume(id: string, consumedAt: Date) {
    const current = this.store.get(id);

    if (!current) {
      return null;
    }

    const next: EmailVerificationToken = {
      ...current,
      consumedAt,
    };

    this.store.set(id, next);

    return next;
  }

  async create(
    input: CreateEmailVerificationTokenInput,
  ): Promise<EmailVerificationToken> {
    const token: EmailVerificationToken = {
      consumedAt: null,
      createdAt: new Date(),
      email: input.email,
      expiresAt: input.expiresAt,
      id: createId("verify"),
      kind: input.kind,
      pendingName: input.pendingName ?? null,
      pendingPasswordHash: input.pendingPasswordHash,
      tokenHash: input.tokenHash,
      userId: input.userId ?? null,
    };

    this.store.set(token.id, token);

    return token;
  }

  async deleteById(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async deleteByUserId(userId: string): Promise<number> {
    const ids = [...this.store.values()]
      .filter((token) => token.userId === userId)
      .map((token) => token.id);

    for (const id of ids) {
      this.store.delete(id);
    }

    return ids.length;
  }

  async deletePendingByEmail(email: string, kind: EmailVerificationTokenKind) {
    const ids = [...this.store.values()]
      .filter(
        (token) =>
          token.email === email &&
          token.kind === kind &&
          token.consumedAt === null,
      )
      .map((token) => token.id);

    for (const id of ids) {
      this.store.delete(id);
    }

    return ids.length;
  }

  async findLatestPendingByEmail(
    email: string,
    kind: EmailVerificationTokenKind,
    now: Date,
  ) {
    return (
      [...this.store.values()]
        .filter(
          (token) =>
            token.email === email &&
            token.kind === kind &&
            token.consumedAt === null &&
            token.expiresAt.getTime() > now.getTime(),
        )
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ??
      null
    );
  }

  async findByTokenHash(
    tokenHash: string,
    kind: EmailVerificationTokenKind,
  ) {
    for (const token of this.store.values()) {
      if (
        token.tokenHash === tokenHash &&
        token.kind === kind
      ) {
        return token;
      }
    }

    return null;
  }
}

class InMemoryPasswordResetTokenRepository
  implements PasswordResetTokenRepository
{
  constructor(
    private readonly store = new Map<string, PasswordResetToken>(),
  ) {}

  async consume(id: string, consumedAt: Date) {
    const current = this.store.get(id);

    if (!current) {
      return null;
    }

    const next: PasswordResetToken = {
      ...current,
      consumedAt,
    };

    this.store.set(id, next);

    return next;
  }

  async create(
    input: {
      expiresAt: Date;
      tokenHash: string;
      userId: string;
    },
  ): Promise<PasswordResetToken> {
    const token: PasswordResetToken = {
      consumedAt: null,
      createdAt: new Date(),
      expiresAt: input.expiresAt,
      id: createId("reset"),
      tokenHash: input.tokenHash,
      userId: input.userId,
    };

    this.store.set(token.id, token);

    return token;
  }

  async deleteById(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async deleteByUserId(userId: string): Promise<number> {
    const ids = [...this.store.values()]
      .filter((token) => token.userId === userId)
      .map((token) => token.id);

    for (const id of ids) {
      this.store.delete(id);
    }

    return ids.length;
  }

  async deletePendingByUserId(userId: string): Promise<number> {
    const ids = [...this.store.values()]
      .filter((token) => token.userId === userId && token.consumedAt === null)
      .map((token) => token.id);

    for (const id of ids) {
      this.store.delete(id);
    }

    return ids.length;
  }

  async findByTokenHash(tokenHash: string): Promise<PasswordResetToken | null> {
    for (const token of this.store.values()) {
      if (token.tokenHash === tokenHash) {
        return token;
      }
    }

    return null;
  }
}

class InMemoryAuthEmailDeliveryRepository
  implements AuthEmailDeliveryRepository
{
  constructor(
    private readonly store = new Map<string, AuthEmailDelivery>(),
  ) {}

  async create(
    input: CreateAuthEmailDeliveryInput,
  ): Promise<AuthEmailDelivery> {
    const delivery: AuthEmailDelivery = {
      createdAt: input.createdAt ?? new Date(),
      email: input.email,
      id: createId("auth_email"),
      kind: input.kind,
    };

    this.store.set(delivery.id, delivery);

    return delivery;
  }

  async deleteByEmail(email: string): Promise<number> {
    const ids = [...this.store.values()]
      .filter((delivery) => delivery.email === email)
      .map((delivery) => delivery.id);

    for (const id of ids) {
      this.store.delete(id);
    }

    return ids.length;
  }

  async deleteById(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async getRateLimitState(
    email: string,
    kind: AuthEmailDeliveryKind,
    hourlyWindowStart: Date,
    dailyWindowStart: Date,
  ): Promise<AuthEmailDeliveryRateLimitState> {
    const dailyRows = [...this.store.values()]
      .filter(
        (delivery) =>
          delivery.email === email &&
          delivery.kind === kind &&
          delivery.createdAt.getTime() >= dailyWindowStart.getTime(),
      )
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
    const hourlyRows = dailyRows.filter(
      (delivery) => delivery.createdAt.getTime() >= hourlyWindowStart.getTime(),
    );

    return {
      dailyCount: dailyRows.length,
      hourlyCount: hourlyRows.length,
      latestRequestedAt:
        dailyRows.length > 0 ? dailyRows[dailyRows.length - 1]!.createdAt : null,
      oldestDailyRequestedAt: dailyRows[0]?.createdAt ?? null,
      oldestHourlyRequestedAt: hourlyRows[0]?.createdAt ?? null,
    };
  }
}

export const createRepositories = (db: Database | null, logger: Logger) => {
  if (db) {
    return {
      authEmailDeliveryRepository: new DrizzleAuthEmailDeliveryRepository(db),
      authProviderRepository: new DrizzleAuthProviderRepository(db),
      emailVerificationTokenRepository:
        new DrizzleEmailVerificationTokenRepository(db),
      localAuthCredentialRepository: new DrizzleLocalAuthCredentialRepository(db),
      passwordResetTokenRepository: new DrizzlePasswordResetTokenRepository(db),
      userRepository: new DrizzleUserRepository(db),
    };
  }

  logger.warn("database.memory_adapter_enabled", {});

  return {
    authEmailDeliveryRepository: new InMemoryAuthEmailDeliveryRepository(),
    authProviderRepository: new InMemoryAuthProviderRepository(),
    emailVerificationTokenRepository:
      new InMemoryEmailVerificationTokenRepository(),
    localAuthCredentialRepository: new InMemoryLocalAuthCredentialRepository(),
    passwordResetTokenRepository: new InMemoryPasswordResetTokenRepository(),
    userRepository: new InMemoryUserRepository(),
  };
};
