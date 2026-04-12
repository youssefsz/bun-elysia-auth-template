import { and, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  appleSubscriptionsTable,
  appleTransactionsTable,
  billingCustomersTable,
  billingEventsTable,
  userEntitlementsTable,
} from "../../db/schema";
import type * as schema from "../../db/schema";
import type {
  AppleSubscription,
  AppleSubscriptionRepository,
  AppleTransaction,
  AppleTransactionRepository,
  BillingCustomer,
  BillingCustomerRepository,
  BillingEvent,
  BillingEventRepository,
  BillingEventSource,
  CreateBillingEventInput,
  EntitlementStatus,
  UpsertAppleSubscriptionInput,
  UpsertAppleTransactionInput,
  UpsertUserEntitlementInput,
  UserEntitlement,
  UserEntitlementRepository,
} from "../../domains/billing/billing.types";
import { createId } from "../../utils/ids";
import type { Logger } from "../../utils/logger";

type Database = PostgresJsDatabase<typeof schema>;

const mapBillingCustomer = (
  row: typeof billingCustomersTable.$inferSelect,
): BillingCustomer => ({
  appAccountToken: row.appAccountToken,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  userId: row.userId,
});

const mapAppleSubscription = (
  row: typeof appleSubscriptionsTable.$inferSelect,
): AppleSubscription => ({
  appAccountToken: row.appAccountToken,
  appTransactionId: row.appTransactionId,
  autoRenewEnabled: row.autoRenewEnabled,
  createdAt: row.createdAt,
  environment: row.environment as AppleSubscription["environment"],
  expiresAt: row.expiresAt,
  gracePeriodExpiresAt: row.gracePeriodExpiresAt,
  id: row.id,
  isInBillingRetryPeriod: row.isInBillingRetryPeriod,
  lastNotificationSubtype: row.lastNotificationSubtype,
  lastNotificationType: row.lastNotificationType,
  lastPurchasedAt: row.lastPurchasedAt,
  lastVerifiedAt: row.lastVerifiedAt,
  latestTransactionId: row.latestTransactionId,
  originalPurchasedAt: row.originalPurchasedAt,
  originalTransactionId: row.originalTransactionId,
  planKey: row.planKey,
  productId: row.productId,
  revocationReason: row.revocationReason,
  revokedAt: row.revokedAt,
  status: row.status as AppleSubscription["status"],
  subscriptionGroupIdentifier: row.subscriptionGroupIdentifier,
  updatedAt: row.updatedAt,
  userId: row.userId,
});

const mapAppleTransaction = (
  row: typeof appleTransactionsTable.$inferSelect,
): AppleTransaction => ({
  appAccountToken: row.appAccountToken,
  appTransactionId: row.appTransactionId,
  createdAt: row.createdAt,
  currency: row.currency,
  environment: row.environment as AppleTransaction["environment"],
  expiresAt: row.expiresAt,
  id: row.id,
  inAppOwnershipType: row.inAppOwnershipType,
  isUpgraded: row.isUpgraded,
  originalPurchaseDate: row.originalPurchaseDate,
  originalTransactionId: row.originalTransactionId,
  priceInMilliunits: row.priceInMilliunits,
  productId: row.productId,
  purchaseDate: row.purchaseDate,
  rawPayload: row.rawPayload,
  revocationReason: row.revocationReason,
  revocationType: row.revocationType,
  revokedAt: row.revokedAt,
  transactionId: row.transactionId,
  transactionReason: row.transactionReason,
  type: row.type,
  userId: row.userId,
  webOrderLineItemId: row.webOrderLineItemId,
});

const mapBillingEvent = (
  row: typeof billingEventsTable.$inferSelect,
): BillingEvent => ({
  createdAt: row.createdAt,
  environment: row.environment as BillingEvent["environment"],
  externalId: row.externalId,
  id: row.id,
  notificationSubtype: row.notificationSubtype,
  notificationType: row.notificationType,
  originalTransactionId: row.originalTransactionId,
  processedAt: row.processedAt,
  rawPayload: row.rawPayload,
  signedDate: row.signedDate,
  source: row.source as BillingEventSource,
  transactionId: row.transactionId,
  userId: row.userId,
});

const mapUserEntitlement = (
  row: typeof userEntitlementsTable.$inferSelect,
): UserEntitlement => ({
  createdAt: row.createdAt,
  expiresAt: row.expiresAt,
  featureKey: row.featureKey,
  lastVerifiedAt: row.lastVerifiedAt,
  planKey: row.planKey,
  productId: row.productId,
  source: row.source as UserEntitlement["source"],
  sourceEnvironment: row.sourceEnvironment as UserEntitlement["sourceEnvironment"],
  sourceOriginalTransactionId: row.sourceOriginalTransactionId,
  status: row.status as EntitlementStatus,
  updatedAt: row.updatedAt,
  userId: row.userId,
});

class DrizzleBillingCustomerRepository implements BillingCustomerRepository {
  constructor(private readonly db: Database) {}

  async create(input: { appAccountToken: string; userId: string }) {
    const [row] = await this.db
      .insert(billingCustomersTable)
      .values({
        appAccountToken: input.appAccountToken,
        userId: input.userId,
      })
      .onConflictDoUpdate({
        set: {
          appAccountToken: input.appAccountToken,
          updatedAt: new Date(),
        },
        target: billingCustomersTable.userId,
      })
      .returning();

    return mapBillingCustomer(row);
  }

  async findByAppAccountToken(appAccountToken: string) {
    const row = await this.db.query.billingCustomersTable.findFirst({
      where: eq(billingCustomersTable.appAccountToken, appAccountToken),
    });

    return row ? mapBillingCustomer(row) : null;
  }

  async findByUserId(userId: string) {
    const row = await this.db.query.billingCustomersTable.findFirst({
      where: eq(billingCustomersTable.userId, userId),
    });

    return row ? mapBillingCustomer(row) : null;
  }
}

class DrizzleAppleSubscriptionRepository implements AppleSubscriptionRepository {
  constructor(private readonly db: Database) {}

  async findByOriginalTransactionId(originalTransactionId: string) {
    const row = await this.db.query.appleSubscriptionsTable.findFirst({
      where: eq(appleSubscriptionsTable.originalTransactionId, originalTransactionId),
    });

    return row ? mapAppleSubscription(row) : null;
  }

  async listByUserId(userId: string) {
    const rows = await this.db.query.appleSubscriptionsTable.findMany({
      orderBy: (table, { desc }) => desc(table.lastVerifiedAt),
      where: eq(appleSubscriptionsTable.userId, userId),
    });

    return rows.map(mapAppleSubscription);
  }

  async upsert(input: UpsertAppleSubscriptionInput) {
    const [row] = await this.db
      .insert(appleSubscriptionsTable)
      .values({
        appAccountToken: input.appAccountToken,
        appTransactionId: input.appTransactionId,
        autoRenewEnabled: input.autoRenewEnabled,
        environment: input.environment,
        expiresAt: input.expiresAt,
        gracePeriodExpiresAt: input.gracePeriodExpiresAt,
        id: createId("sub"),
        isInBillingRetryPeriod: input.isInBillingRetryPeriod,
        lastNotificationSubtype: input.lastNotificationSubtype,
        lastNotificationType: input.lastNotificationType,
        lastPurchasedAt: input.lastPurchasedAt,
        lastVerifiedAt: input.lastVerifiedAt,
        latestTransactionId: input.latestTransactionId,
        originalPurchasedAt: input.originalPurchasedAt,
        originalTransactionId: input.originalTransactionId,
        planKey: input.planKey,
        productId: input.productId,
        revocationReason: input.revocationReason,
        revokedAt: input.revokedAt,
        status: input.status,
        subscriptionGroupIdentifier: input.subscriptionGroupIdentifier,
        updatedAt: new Date(),
        userId: input.userId,
      })
      .onConflictDoUpdate({
        set: {
          appAccountToken: input.appAccountToken,
          appTransactionId: input.appTransactionId,
          autoRenewEnabled: input.autoRenewEnabled,
          environment: input.environment,
          expiresAt: input.expiresAt,
          gracePeriodExpiresAt: input.gracePeriodExpiresAt,
          isInBillingRetryPeriod: input.isInBillingRetryPeriod,
          lastNotificationSubtype: input.lastNotificationSubtype,
          lastNotificationType: input.lastNotificationType,
          lastPurchasedAt: input.lastPurchasedAt,
          lastVerifiedAt: input.lastVerifiedAt,
          latestTransactionId: input.latestTransactionId,
          originalPurchasedAt: input.originalPurchasedAt,
          planKey: input.planKey,
          productId: input.productId,
          revocationReason: input.revocationReason,
          revokedAt: input.revokedAt,
          status: input.status,
          subscriptionGroupIdentifier: input.subscriptionGroupIdentifier,
          updatedAt: new Date(),
          userId: input.userId,
        },
        target: appleSubscriptionsTable.originalTransactionId,
      })
      .returning();

    return mapAppleSubscription(row);
  }
}

class DrizzleAppleTransactionRepository implements AppleTransactionRepository {
  constructor(private readonly db: Database) {}

  async findByTransactionId(transactionId: string) {
    const row = await this.db.query.appleTransactionsTable.findFirst({
      where: eq(appleTransactionsTable.transactionId, transactionId),
    });

    return row ? mapAppleTransaction(row) : null;
  }

  async upsert(input: UpsertAppleTransactionInput) {
    const [row] = await this.db
      .insert(appleTransactionsTable)
      .values({
        appAccountToken: input.appAccountToken,
        appTransactionId: input.appTransactionId,
        currency: input.currency,
        environment: input.environment,
        expiresAt: input.expiresAt,
        id: createId("txn"),
        inAppOwnershipType: input.inAppOwnershipType,
        isUpgraded: input.isUpgraded,
        originalPurchaseDate: input.originalPurchaseDate,
        originalTransactionId: input.originalTransactionId,
        priceInMilliunits: input.priceInMilliunits,
        productId: input.productId,
        purchaseDate: input.purchaseDate,
        rawPayload: input.rawPayload,
        revocationReason: input.revocationReason,
        revocationType: input.revocationType,
        revokedAt: input.revokedAt,
        transactionId: input.transactionId,
        transactionReason: input.transactionReason,
        type: input.type,
        userId: input.userId,
        webOrderLineItemId: input.webOrderLineItemId,
      })
      .onConflictDoUpdate({
        set: {
          appAccountToken: input.appAccountToken,
          appTransactionId: input.appTransactionId,
          currency: input.currency,
          environment: input.environment,
          expiresAt: input.expiresAt,
          inAppOwnershipType: input.inAppOwnershipType,
          isUpgraded: input.isUpgraded,
          originalPurchaseDate: input.originalPurchaseDate,
          originalTransactionId: input.originalTransactionId,
          priceInMilliunits: input.priceInMilliunits,
          productId: input.productId,
          purchaseDate: input.purchaseDate,
          rawPayload: input.rawPayload,
          revocationReason: input.revocationReason,
          revocationType: input.revocationType,
          revokedAt: input.revokedAt,
          transactionReason: input.transactionReason,
          type: input.type,
          userId: input.userId,
          webOrderLineItemId: input.webOrderLineItemId,
        },
        target: appleTransactionsTable.transactionId,
      })
      .returning();

    return mapAppleTransaction(row);
  }
}

class DrizzleBillingEventRepository implements BillingEventRepository {
  constructor(private readonly db: Database) {}

  async createIfAbsent(input: CreateBillingEventInput) {
    const [row] = await this.db
      .insert(billingEventsTable)
      .values({
        environment: input.environment,
        externalId: input.externalId,
        id: createId("bill_evt"),
        notificationSubtype: input.notificationSubtype,
        notificationType: input.notificationType,
        originalTransactionId: input.originalTransactionId,
        processedAt: input.processedAt,
        rawPayload: input.rawPayload,
        signedDate: input.signedDate,
        source: input.source,
        transactionId: input.transactionId,
        userId: input.userId,
      })
      .onConflictDoNothing()
      .returning();

    return row ? mapBillingEvent(row) : null;
  }

  async findBySourceAndExternalId(source: BillingEventSource, externalId: string) {
    const row = await this.db.query.billingEventsTable.findFirst({
      where: and(
        eq(billingEventsTable.source, source),
        eq(billingEventsTable.externalId, externalId),
      ),
    });

    return row ? mapBillingEvent(row) : null;
  }
}

class DrizzleUserEntitlementRepository implements UserEntitlementRepository {
  constructor(private readonly db: Database) {}

  async findByUserIdAndFeatureKey(userId: string, featureKey: string) {
    const row = await this.db.query.userEntitlementsTable.findFirst({
      where: and(
        eq(userEntitlementsTable.userId, userId),
        eq(userEntitlementsTable.featureKey, featureKey),
      ),
    });

    return row ? mapUserEntitlement(row) : null;
  }

  async listByUserId(userId: string) {
    const rows = await this.db.query.userEntitlementsTable.findMany({
      orderBy: (table, { asc }) => asc(table.featureKey),
      where: eq(userEntitlementsTable.userId, userId),
    });

    return rows.map(mapUserEntitlement);
  }

  async upsert(input: UpsertUserEntitlementInput) {
    const [row] = await this.db
      .insert(userEntitlementsTable)
      .values({
        expiresAt: input.expiresAt,
        featureKey: input.featureKey,
        id: createId("ent"),
        lastVerifiedAt: input.lastVerifiedAt,
        planKey: input.planKey,
        productId: input.productId,
        source: input.source,
        sourceEnvironment: input.sourceEnvironment,
        sourceOriginalTransactionId: input.sourceOriginalTransactionId,
        status: input.status,
        updatedAt: new Date(),
        userId: input.userId,
      })
      .onConflictDoUpdate({
        set: {
          expiresAt: input.expiresAt,
          lastVerifiedAt: input.lastVerifiedAt,
          planKey: input.planKey,
          productId: input.productId,
          source: input.source,
          sourceEnvironment: input.sourceEnvironment,
          sourceOriginalTransactionId: input.sourceOriginalTransactionId,
          status: input.status,
          updatedAt: new Date(),
        },
        target: [userEntitlementsTable.userId, userEntitlementsTable.featureKey],
      })
      .returning();

    return mapUserEntitlement(row);
  }
}

class InMemoryBillingCustomerRepository implements BillingCustomerRepository {
  constructor(private readonly store = new Map<string, BillingCustomer>()) {}

  async create(input: { appAccountToken: string; userId: string }) {
    const now = new Date();
    const value: BillingCustomer = {
      appAccountToken: input.appAccountToken,
      createdAt: this.store.get(input.userId)?.createdAt ?? now,
      updatedAt: now,
      userId: input.userId,
    };

    this.store.set(input.userId, value);

    return value;
  }

  async findByAppAccountToken(appAccountToken: string) {
    for (const value of this.store.values()) {
      if (value.appAccountToken === appAccountToken) {
        return value;
      }
    }

    return null;
  }

  async findByUserId(userId: string) {
    return this.store.get(userId) ?? null;
  }
}

class InMemoryAppleSubscriptionRepository implements AppleSubscriptionRepository {
  constructor(private readonly store = new Map<string, AppleSubscription>()) {}

  async findByOriginalTransactionId(originalTransactionId: string) {
    return this.store.get(originalTransactionId) ?? null;
  }

  async listByUserId(userId: string) {
    return [...this.store.values()]
      .filter((value) => value.userId === userId)
      .sort((left, right) => right.lastVerifiedAt.getTime() - left.lastVerifiedAt.getTime());
  }

  async upsert(input: UpsertAppleSubscriptionInput) {
    const current = this.store.get(input.originalTransactionId);
    const value: AppleSubscription = {
      appAccountToken: input.appAccountToken,
      appTransactionId: input.appTransactionId,
      autoRenewEnabled: input.autoRenewEnabled,
      createdAt: current?.createdAt ?? new Date(),
      environment: input.environment,
      expiresAt: input.expiresAt,
      gracePeriodExpiresAt: input.gracePeriodExpiresAt,
      id: current?.id ?? createId("sub"),
      isInBillingRetryPeriod: input.isInBillingRetryPeriod,
      lastNotificationSubtype: input.lastNotificationSubtype,
      lastNotificationType: input.lastNotificationType,
      lastPurchasedAt: input.lastPurchasedAt,
      lastVerifiedAt: input.lastVerifiedAt,
      latestTransactionId: input.latestTransactionId,
      originalPurchasedAt: input.originalPurchasedAt,
      originalTransactionId: input.originalTransactionId,
      planKey: input.planKey,
      productId: input.productId,
      revocationReason: input.revocationReason,
      revokedAt: input.revokedAt,
      status: input.status,
      subscriptionGroupIdentifier: input.subscriptionGroupIdentifier,
      updatedAt: new Date(),
      userId: input.userId,
    };

    this.store.set(input.originalTransactionId, value);

    return value;
  }
}

class InMemoryAppleTransactionRepository implements AppleTransactionRepository {
  constructor(private readonly store = new Map<string, AppleTransaction>()) {}

  async findByTransactionId(transactionId: string) {
    return this.store.get(transactionId) ?? null;
  }

  async upsert(input: UpsertAppleTransactionInput) {
    const current = this.store.get(input.transactionId);
    const value: AppleTransaction = {
      appAccountToken: input.appAccountToken,
      appTransactionId: input.appTransactionId,
      createdAt: current?.createdAt ?? new Date(),
      currency: input.currency,
      environment: input.environment,
      expiresAt: input.expiresAt,
      id: current?.id ?? createId("txn"),
      inAppOwnershipType: input.inAppOwnershipType,
      isUpgraded: input.isUpgraded,
      originalPurchaseDate: input.originalPurchaseDate,
      originalTransactionId: input.originalTransactionId,
      priceInMilliunits: input.priceInMilliunits,
      productId: input.productId,
      purchaseDate: input.purchaseDate,
      rawPayload: input.rawPayload,
      revocationReason: input.revocationReason,
      revocationType: input.revocationType,
      revokedAt: input.revokedAt,
      transactionId: input.transactionId,
      transactionReason: input.transactionReason,
      type: input.type,
      userId: input.userId,
      webOrderLineItemId: input.webOrderLineItemId,
    };

    this.store.set(input.transactionId, value);

    return value;
  }
}

class InMemoryBillingEventRepository implements BillingEventRepository {
  constructor(private readonly store = new Map<string, BillingEvent>()) {}

  private key(source: BillingEventSource, externalId: string) {
    return `${source}:${externalId}`;
  }

  async createIfAbsent(input: CreateBillingEventInput) {
    const key = this.key(input.source, input.externalId);
    const current = this.store.get(key);

    if (current) {
      return null;
    }

    const value: BillingEvent = {
      createdAt: new Date(),
      environment: input.environment,
      externalId: input.externalId,
      id: createId("bill_evt"),
      notificationSubtype: input.notificationSubtype,
      notificationType: input.notificationType,
      originalTransactionId: input.originalTransactionId,
      processedAt: input.processedAt,
      rawPayload: input.rawPayload,
      signedDate: input.signedDate,
      source: input.source,
      transactionId: input.transactionId,
      userId: input.userId,
    };

    this.store.set(key, value);

    return value;
  }

  async findBySourceAndExternalId(source: BillingEventSource, externalId: string) {
    return this.store.get(this.key(source, externalId)) ?? null;
  }
}

class InMemoryUserEntitlementRepository implements UserEntitlementRepository {
  constructor(private readonly store = new Map<string, UserEntitlement>()) {}

  private key(userId: string, featureKey: string) {
    return `${userId}:${featureKey}`;
  }

  async findByUserIdAndFeatureKey(userId: string, featureKey: string) {
    return this.store.get(this.key(userId, featureKey)) ?? null;
  }

  async listByUserId(userId: string) {
    return [...this.store.values()]
      .filter((value) => value.userId === userId)
      .sort((left, right) => left.featureKey.localeCompare(right.featureKey));
  }

  async upsert(input: UpsertUserEntitlementInput) {
    const key = this.key(input.userId, input.featureKey);
    const current = this.store.get(key);
    const value: UserEntitlement = {
      createdAt: current?.createdAt ?? new Date(),
      expiresAt: input.expiresAt,
      featureKey: input.featureKey,
      lastVerifiedAt: input.lastVerifiedAt,
      planKey: input.planKey,
      productId: input.productId,
      source: input.source,
      sourceEnvironment: input.sourceEnvironment,
      sourceOriginalTransactionId: input.sourceOriginalTransactionId,
      status: input.status,
      updatedAt: new Date(),
      userId: input.userId,
    };

    this.store.set(key, value);

    return value;
  }
}

export const createBillingRepositories = (db: Database | null, logger: Logger) => {
  if (db) {
    return {
      appleSubscriptionRepository: new DrizzleAppleSubscriptionRepository(db),
      appleTransactionRepository: new DrizzleAppleTransactionRepository(db),
      billingCustomerRepository: new DrizzleBillingCustomerRepository(db),
      billingEventRepository: new DrizzleBillingEventRepository(db),
      userEntitlementRepository: new DrizzleUserEntitlementRepository(db),
    };
  }

  logger.warn("database.memory_billing_adapter_enabled", {});

  return {
    appleSubscriptionRepository: new InMemoryAppleSubscriptionRepository(),
    appleTransactionRepository: new InMemoryAppleTransactionRepository(),
    billingCustomerRepository: new InMemoryBillingCustomerRepository(),
    billingEventRepository: new InMemoryBillingEventRepository(),
    userEntitlementRepository: new InMemoryUserEntitlementRepository(),
  };
};
