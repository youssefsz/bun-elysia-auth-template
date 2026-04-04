import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { authProvidersTable, usersTable } from "../../db/schema";
import type {
  AuthProvider,
  AuthProviderRepository,
  AuthProviderName,
  CreateAuthProviderInput,
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

  async listByUserId(userId: string): Promise<AuthProvider[]> {
    const rows = await this.db.query.authProvidersTable.findMany({
      orderBy: (table, { asc }) => asc(table.createdAt),
      where: eq(authProvidersTable.userId, userId),
    });

    return rows.map(mapAuthProvider);
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

  async listByUserId(userId: string): Promise<AuthProvider[]> {
    return [...this.store.values()]
      .filter((provider) => provider.userId === userId)
      .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }
}

export const createRepositories = (db: Database | null, logger: Logger) => {
  if (db) {
    return {
      authProviderRepository: new DrizzleAuthProviderRepository(db),
      userRepository: new DrizzleUserRepository(db),
    };
  }

  logger.warn("database.memory_adapter_enabled", {});

  return {
    authProviderRepository: new InMemoryAuthProviderRepository(),
    userRepository: new InMemoryUserRepository(),
  };
};
