export type BillingEnvironment = "production" | "sandbox";

export type BillingSource = "apple";

export type AppleSubscriptionStatus =
  | "active"
  | "billing_retry"
  | "expired"
  | "grace_period"
  | "revoked";

export type EntitlementStatus =
  | "active"
  | "billing_retry"
  | "expired"
  | "grace_period"
  | "inactive"
  | "revoked";

export type BillingEventSource = "apple_notification" | "apple_sync";

export interface BillingProductCatalogItem {
  featureKeys: string[];
  planKey: string;
  productId: string;
}

export interface BillingCustomer {
  appAccountToken: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string;
}

export interface AppleSubscription {
  appAccountToken: string | null;
  appTransactionId: string | null;
  autoRenewEnabled: boolean | null;
  createdAt: Date;
  environment: BillingEnvironment;
  expiresAt: Date | null;
  gracePeriodExpiresAt: Date | null;
  id: string;
  isInBillingRetryPeriod: boolean;
  lastNotificationSubtype: string | null;
  lastNotificationType: string | null;
  lastPurchasedAt: Date | null;
  lastVerifiedAt: Date;
  latestTransactionId: string | null;
  originalPurchasedAt: Date | null;
  originalTransactionId: string;
  planKey: string;
  productId: string;
  revocationReason: string | null;
  revokedAt: Date | null;
  status: AppleSubscriptionStatus;
  subscriptionGroupIdentifier: string | null;
  updatedAt: Date;
  userId: string;
}

export interface AppleTransaction {
  appAccountToken: string | null;
  appTransactionId: string | null;
  createdAt: Date;
  currency: string | null;
  environment: BillingEnvironment;
  expiresAt: Date | null;
  id: string;
  inAppOwnershipType: string | null;
  isUpgraded: boolean;
  originalPurchaseDate: Date | null;
  originalTransactionId: string;
  priceInMilliunits: number | null;
  productId: string;
  purchaseDate: Date;
  rawPayload: Record<string, unknown>;
  revocationReason: string | null;
  revocationType: string | null;
  revokedAt: Date | null;
  transactionId: string;
  transactionReason: string | null;
  type: string;
  userId: string;
  webOrderLineItemId: string | null;
}

export interface BillingEvent {
  createdAt: Date;
  environment: BillingEnvironment | null;
  externalId: string;
  id: string;
  notificationSubtype: string | null;
  notificationType: string | null;
  originalTransactionId: string | null;
  processedAt: Date;
  rawPayload: Record<string, unknown>;
  signedDate: Date | null;
  source: BillingEventSource;
  transactionId: string | null;
  userId: string | null;
}

export interface UserEntitlement {
  createdAt: Date;
  expiresAt: Date | null;
  featureKey: string;
  lastVerifiedAt: Date;
  planKey: string | null;
  productId: string | null;
  source: BillingSource;
  sourceEnvironment: BillingEnvironment | null;
  sourceOriginalTransactionId: string | null;
  status: EntitlementStatus;
  updatedAt: Date;
  userId: string;
}

export interface UpsertAppleSubscriptionInput {
  appAccountToken: string | null;
  appTransactionId: string | null;
  autoRenewEnabled: boolean | null;
  environment: BillingEnvironment;
  expiresAt: Date | null;
  gracePeriodExpiresAt: Date | null;
  isInBillingRetryPeriod: boolean;
  lastNotificationSubtype: string | null;
  lastNotificationType: string | null;
  lastPurchasedAt: Date | null;
  lastVerifiedAt: Date;
  latestTransactionId: string | null;
  originalPurchasedAt: Date | null;
  originalTransactionId: string;
  planKey: string;
  productId: string;
  revocationReason: string | null;
  revokedAt: Date | null;
  status: AppleSubscriptionStatus;
  subscriptionGroupIdentifier: string | null;
  userId: string;
}

export interface UpsertAppleTransactionInput {
  appAccountToken: string | null;
  appTransactionId: string | null;
  currency: string | null;
  environment: BillingEnvironment;
  expiresAt: Date | null;
  inAppOwnershipType: string | null;
  isUpgraded: boolean;
  originalPurchaseDate: Date | null;
  originalTransactionId: string;
  priceInMilliunits: number | null;
  productId: string;
  purchaseDate: Date;
  rawPayload: Record<string, unknown>;
  revocationReason: string | null;
  revocationType: string | null;
  revokedAt: Date | null;
  transactionId: string;
  transactionReason: string | null;
  type: string;
  userId: string;
  webOrderLineItemId: string | null;
}

export interface CreateBillingEventInput {
  environment: BillingEnvironment | null;
  externalId: string;
  notificationSubtype: string | null;
  notificationType: string | null;
  originalTransactionId: string | null;
  processedAt: Date;
  rawPayload: Record<string, unknown>;
  signedDate: Date | null;
  source: BillingEventSource;
  transactionId: string | null;
  userId: string | null;
}

export interface UpsertUserEntitlementInput {
  expiresAt: Date | null;
  featureKey: string;
  lastVerifiedAt: Date;
  planKey: string | null;
  productId: string | null;
  source: BillingSource;
  sourceEnvironment: BillingEnvironment | null;
  sourceOriginalTransactionId: string | null;
  status: EntitlementStatus;
  userId: string;
}

export interface BillingCustomerRepository {
  create(input: { appAccountToken: string; userId: string }): Promise<BillingCustomer>;
  findByAppAccountToken(appAccountToken: string): Promise<BillingCustomer | null>;
  findByUserId(userId: string): Promise<BillingCustomer | null>;
}

export interface AppleSubscriptionRepository {
  findByOriginalTransactionId(
    originalTransactionId: string,
  ): Promise<AppleSubscription | null>;
  listByUserId(userId: string): Promise<AppleSubscription[]>;
  upsert(input: UpsertAppleSubscriptionInput): Promise<AppleSubscription>;
}

export interface AppleTransactionRepository {
  findByTransactionId(transactionId: string): Promise<AppleTransaction | null>;
  upsert(input: UpsertAppleTransactionInput): Promise<AppleTransaction>;
}

export interface BillingEventRepository {
  createIfAbsent(input: CreateBillingEventInput): Promise<BillingEvent | null>;
  findBySourceAndExternalId(
    source: BillingEventSource,
    externalId: string,
  ): Promise<BillingEvent | null>;
}

export interface UserEntitlementRepository {
  findByUserIdAndFeatureKey(
    userId: string,
    featureKey: string,
  ): Promise<UserEntitlement | null>;
  listByUserId(userId: string): Promise<UserEntitlement[]>;
  upsert(input: UpsertUserEntitlementInput): Promise<UserEntitlement>;
}
