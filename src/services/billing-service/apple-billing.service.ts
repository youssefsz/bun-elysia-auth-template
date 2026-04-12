import {
  Status,
  Type,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  type StatusResponse,
} from "@apple/app-store-server-library";
import type { AppleBillingGateway } from "../../core/billing/apple/apple-app-store-gateway";
import { billingEnvironmentFromAppleValue } from "../../core/billing/apple/apple-app-store-gateway";
import type {
  AppleSubscription,
  AppleSubscriptionRepository,
  AppleTransactionRepository,
  BillingCustomerRepository,
  BillingEnvironment,
  BillingEventRepository,
  BillingProductCatalogItem,
} from "../../domains/billing/billing.types";
import { AppError } from "../../utils/app-error";
import type { Logger } from "../../utils/logger";
import { EntitlementService } from "../entitlement-service/entitlement.service";

const toDate = (value: number | null | undefined) =>
  typeof value === "number" ? new Date(value) : null;

const isAutoRenewableSubscription = (value: string | undefined) =>
  value === Type.AUTO_RENEWABLE_SUBSCRIPTION;

const mapAppleStatus = (status: Status | number | undefined) => {
  switch (status) {
    case Status.ACTIVE:
      return "active" as const;
    case Status.BILLING_GRACE_PERIOD:
      return "grace_period" as const;
    case Status.BILLING_RETRY:
      return "billing_retry" as const;
    case Status.REVOKED:
      return "revoked" as const;
    case Status.EXPIRED:
    default:
      return "expired" as const;
  }
};

const deriveStatusFromSignedData = ({
  now,
  renewal,
  transaction,
}: {
  now: Date;
  renewal: JWSRenewalInfoDecodedPayload | null;
  transaction: JWSTransactionDecodedPayload;
}) => {
  if (transaction.revocationDate) {
    return "revoked" as const;
  }

  if (
    renewal?.gracePeriodExpiresDate &&
    renewal.gracePeriodExpiresDate > now.getTime()
  ) {
    return "grace_period" as const;
  }

  if (renewal?.isInBillingRetryPeriod) {
    return "billing_retry" as const;
  }

  if (transaction.expiresDate && transaction.expiresDate > now.getTime()) {
    return "active" as const;
  }

  return "expired" as const;
};

const normalizeProductId = ({
  renewal,
  transaction,
}: {
  renewal: JWSRenewalInfoDecodedPayload | null;
  transaction: JWSTransactionDecodedPayload;
}) => renewal?.autoRenewProductId ?? renewal?.productId ?? transaction.productId;

interface AppleBillingServiceDependencies {
  appleBillingGateway: AppleBillingGateway;
  appleSubscriptionRepository: AppleSubscriptionRepository;
  appleTransactionRepository: AppleTransactionRepository;
  billingCustomerRepository: BillingCustomerRepository;
  billingEventRepository: BillingEventRepository;
  entitlementService: EntitlementService;
  logger: Logger;
  productCatalog: BillingProductCatalogItem[];
}

export class AppleBillingService {
  private readonly productCatalogByProductId: Map<string, BillingProductCatalogItem>;

  constructor(private readonly deps: AppleBillingServiceDependencies) {
    this.productCatalogByProductId = new Map(
      deps.productCatalog.map((item) => [item.productId, item]),
    );
  }

  async getBillingOverview(userId: string) {
    const customer = await this.getOrCreateBillingCustomer(userId);
    const entitlements = await this.deps.entitlementService.listUserEntitlements(userId);
    const subscriptions =
      await this.deps.appleSubscriptionRepository.listByUserId(userId);

    return {
      apple: {
        appAccountToken: customer.appAccountToken,
      },
      entitlements,
      subscriptions: subscriptions.map((subscription) => ({
        environment: subscription.environment,
        expiresAt: subscription.expiresAt?.toISOString() ?? null,
        gracePeriodExpiresAt:
          subscription.gracePeriodExpiresAt?.toISOString() ?? null,
        originalTransactionId: subscription.originalTransactionId,
        planKey: subscription.planKey,
        productId: subscription.productId,
        status: subscription.status,
      })),
    };
  }

  async handleNotification(signedPayload: string) {
    this.requireGateway();

    const notification =
      await this.deps.appleBillingGateway.verifyNotification(signedPayload);
    const externalId =
      notification.notificationUUID ??
      `${notification.notificationType ?? "unknown"}:${notification.signedDate ?? 0}`;
    const existing = await this.deps.billingEventRepository.findBySourceAndExternalId(
      "apple_notification",
      externalId,
    );

    if (existing) {
      return {
        accepted: true,
        duplicate: true,
      };
    }

    const transaction = notification.data?.signedTransactionInfo
      ? await this.deps.appleBillingGateway.verifySignedTransaction(
          notification.data.signedTransactionInfo,
        )
      : null;
    const renewal = notification.data?.signedRenewalInfo
      ? await this.deps.appleBillingGateway.verifySignedRenewalInfo(
          notification.data.signedRenewalInfo,
        )
      : null;
    const resolvedUserId = await this.resolveObservedUserId({
      appAccountToken: transaction?.appAccountToken ?? renewal?.appAccountToken,
      originalTransactionId:
        transaction?.originalTransactionId ?? renewal?.originalTransactionId,
    });

    const affectedUsers = transaction?.originalTransactionId
      ? await this.refreshFromAppleStatus({
          environment: billingEnvironmentFromAppleValue(
            transaction.environment ??
              renewal?.environment ??
              notification.data?.environment,
          ),
          fallbackRenewal: renewal,
          fallbackTransaction: transaction,
          notification,
          originalTransactionId: transaction.originalTransactionId,
          userId: resolvedUserId,
        })
      : [];

    await this.deps.billingEventRepository.createIfAbsent({
      environment: notification.data?.environment
        ? billingEnvironmentFromAppleValue(notification.data.environment)
        : null,
      externalId,
      notificationSubtype: notification.subtype ?? null,
      notificationType: notification.notificationType ?? null,
      originalTransactionId:
        transaction?.originalTransactionId ?? renewal?.originalTransactionId ?? null,
      processedAt: new Date(),
      rawPayload: notification as unknown as Record<string, unknown>,
      signedDate: toDate(notification.signedDate),
      source: "apple_notification",
      transactionId: transaction?.transactionId ?? null,
      userId: resolvedUserId,
    });

    return {
      accepted: true,
      duplicate: false,
      affectedUserIds: affectedUsers,
    };
  }

  async syncSubscriptionFromApp(input: {
    signedTransactionInfo: string;
    userId: string;
  }) {
    this.requireGateway();

    const transaction = await this.deps.appleBillingGateway.verifySignedTransaction(
      input.signedTransactionInfo,
    );

    if (!isAutoRenewableSubscription(transaction.type)) {
      throw new AppError(
        400,
        "APPLE_TRANSACTION_TYPE_UNSUPPORTED",
        "Only auto-renewable subscriptions are supported for premium access.",
      );
    }

    if (!transaction.originalTransactionId || !transaction.transactionId) {
      throw new AppError(
        400,
        "APPLE_TRANSACTION_INVALID",
        "The Apple transaction is missing required identifiers.",
      );
    }

    const product = this.requireCatalogItem(
      transaction.productId,
      "APPLE_PRODUCT_NOT_ALLOWED",
    );
    await this.ensureUserOwnsTransaction({
      expectedUserId: input.userId,
      originalTransactionId: transaction.originalTransactionId,
      transactionAppAccountToken: transaction.appAccountToken,
    });
    const customer = await this.getOrCreateBillingCustomer(input.userId);
    const environment = billingEnvironmentFromAppleValue(transaction.environment);

    if (customer.appAccountToken !== transaction.appAccountToken) {
      await this.deps.appleBillingGateway.setAppAccountToken({
        appAccountToken: customer.appAccountToken,
        environment,
        originalTransactionId: transaction.originalTransactionId,
      });
    }

    const affectedUsers = await this.refreshFromAppleStatus({
      environment,
      fallbackRenewal: null,
      fallbackTransaction: transaction,
      notification: null,
      originalTransactionId: transaction.originalTransactionId,
      userId: input.userId,
    });

    await this.deps.billingEventRepository.createIfAbsent({
      environment,
      externalId: transaction.transactionId,
      notificationSubtype: null,
      notificationType: "APP_SYNC",
      originalTransactionId: transaction.originalTransactionId,
      processedAt: new Date(),
      rawPayload: {
        productId: product.productId,
        source: "app_sync",
        transactionId: transaction.transactionId,
      },
      signedDate: toDate(transaction.signedDate),
      source: "apple_sync",
      transactionId: transaction.transactionId,
      userId: input.userId,
    });

    return {
      affectedUserIds: affectedUsers,
      ...(await this.getBillingOverview(input.userId)),
    };
  }

  private async applySnapshot(input: {
    notification: ResponseBodyV2DecodedPayload | null;
    renewal: JWSRenewalInfoDecodedPayload | null;
    status: Status | number | undefined;
    transaction: JWSTransactionDecodedPayload;
    userId: string;
  }) {
    const productId = normalizeProductId({
      renewal: input.renewal,
      transaction: input.transaction,
    });
    const catalogItem = this.requireCatalogItem(
      productId,
      "APPLE_PRODUCT_NOT_ALLOWED",
    );

    await this.deps.appleTransactionRepository.upsert({
      appAccountToken: input.transaction.appAccountToken ?? input.renewal?.appAccountToken ?? null,
      appTransactionId:
        input.transaction.appTransactionId ?? input.renewal?.appTransactionId ?? null,
      currency: input.transaction.currency ?? input.renewal?.currency ?? null,
      environment: billingEnvironmentFromAppleValue(input.transaction.environment),
      expiresAt:
        toDate(input.transaction.expiresDate) ??
        toDate(input.renewal?.renewalDate) ??
        null,
      inAppOwnershipType: input.transaction.inAppOwnershipType ?? null,
      isUpgraded: Boolean(input.transaction.isUpgraded),
      originalPurchaseDate: toDate(input.transaction.originalPurchaseDate),
      originalTransactionId: input.transaction.originalTransactionId!,
      priceInMilliunits: input.transaction.price ?? input.renewal?.renewalPrice ?? null,
      productId: catalogItem.productId,
      purchaseDate: toDate(input.transaction.purchaseDate) ?? new Date(),
      rawPayload: input.transaction as unknown as Record<string, unknown>,
      revocationReason:
        input.transaction.revocationReason !== undefined
          ? String(input.transaction.revocationReason)
          : null,
      revocationType:
        input.transaction.revocationType !== undefined
          ? String(input.transaction.revocationType)
          : null,
      revokedAt: toDate(input.transaction.revocationDate),
      transactionId: input.transaction.transactionId!,
      transactionReason: input.transaction.transactionReason ?? null,
      type: input.transaction.type ?? Type.AUTO_RENEWABLE_SUBSCRIPTION,
      userId: input.userId,
      webOrderLineItemId: input.transaction.webOrderLineItemId ?? null,
    });

    await this.deps.appleSubscriptionRepository.upsert({
      appAccountToken: input.transaction.appAccountToken ?? input.renewal?.appAccountToken ?? null,
      appTransactionId:
        input.transaction.appTransactionId ?? input.renewal?.appTransactionId ?? null,
      autoRenewEnabled:
        input.renewal?.autoRenewStatus === undefined
          ? null
          : Number(input.renewal.autoRenewStatus) === 1,
      environment: billingEnvironmentFromAppleValue(input.transaction.environment),
      expiresAt:
        toDate(input.transaction.expiresDate) ??
        toDate(input.renewal?.renewalDate) ??
        null,
      gracePeriodExpiresAt: toDate(input.renewal?.gracePeriodExpiresDate),
      isInBillingRetryPeriod: Boolean(input.renewal?.isInBillingRetryPeriod),
      lastNotificationSubtype: input.notification?.subtype ?? null,
      lastNotificationType: input.notification?.notificationType ?? null,
      lastPurchasedAt: toDate(input.transaction.purchaseDate),
      lastVerifiedAt: new Date(),
      latestTransactionId: input.transaction.transactionId ?? null,
      originalPurchasedAt: toDate(input.transaction.originalPurchaseDate),
      originalTransactionId: input.transaction.originalTransactionId!,
      planKey: catalogItem.planKey,
      productId: catalogItem.productId,
      revocationReason:
        input.transaction.revocationReason !== undefined
          ? String(input.transaction.revocationReason)
          : null,
      revokedAt: toDate(input.transaction.revocationDate),
      status:
        input.status !== undefined
          ? mapAppleStatus(input.status)
          : deriveStatusFromSignedData({
              now: new Date(),
              renewal: input.renewal,
              transaction: input.transaction,
            }),
      subscriptionGroupIdentifier:
        input.transaction.subscriptionGroupIdentifier ?? null,
      userId: input.userId,
    });
  }

  private async ensureUserOwnsTransaction(input: {
    expectedUserId: string;
    originalTransactionId: string;
    transactionAppAccountToken: string | undefined;
  }) {
    if (input.transactionAppAccountToken) {
      const customer =
        await this.deps.billingCustomerRepository.findByAppAccountToken(
          input.transactionAppAccountToken,
        );

      if (customer && customer.userId !== input.expectedUserId) {
        throw new AppError(
          409,
          "APPLE_TRANSACTION_USER_MISMATCH",
          "This Apple subscription is already linked to another account.",
        );
      }
    }

    const existingSubscription =
      await this.deps.appleSubscriptionRepository.findByOriginalTransactionId(
        input.originalTransactionId,
      );

    if (
      existingSubscription &&
      existingSubscription.userId !== input.expectedUserId
    ) {
      throw new AppError(
        409,
        "APPLE_TRANSACTION_USER_MISMATCH",
        "This Apple subscription is already linked to another account.",
      );
    }
  }

  private async getOrCreateBillingCustomer(userId: string) {
    const current = await this.deps.billingCustomerRepository.findByUserId(userId);

    if (current) {
      return current;
    }

    return this.deps.billingCustomerRepository.create({
      appAccountToken: crypto.randomUUID(),
      userId,
    });
  }

  private async refreshFromAppleStatus(input: {
    environment: BillingEnvironment;
    fallbackRenewal: JWSRenewalInfoDecodedPayload | null;
    fallbackTransaction: JWSTransactionDecodedPayload | null;
    notification: ResponseBodyV2DecodedPayload | null;
    originalTransactionId: string;
    userId: string | null;
  }) {
    try {
      const statusResponse =
        await this.deps.appleBillingGateway.getAllSubscriptionStatuses({
          environment: input.environment,
          transactionId: input.originalTransactionId,
        });

      return this.applyStatusResponse({
        notification: input.notification,
        statusResponse,
        userId: input.userId,
      });
    } catch (error) {
      this.deps.logger.warn("apple.billing.status_refresh_failed", {
        environment: input.environment,
        error,
        originalTransactionId: input.originalTransactionId,
      });

      if (input.userId && input.fallbackTransaction) {
        await this.applySnapshot({
          notification: input.notification,
          renewal: input.fallbackRenewal,
          status: undefined,
          transaction: input.fallbackTransaction,
          userId: input.userId,
        });
        const subscriptions =
          await this.deps.appleSubscriptionRepository.listByUserId(input.userId);
        await this.deps.entitlementService.syncUserEntitlements(
          input.userId,
          subscriptions,
        );

        return [input.userId];
      }

      return [];
    }
  }

  private async applyStatusResponse(input: {
    notification: ResponseBodyV2DecodedPayload | null;
    statusResponse: StatusResponse;
    userId: string | null;
  }) {
    const affectedUsers = new Set<string>();

    for (const group of input.statusResponse.data ?? []) {
      for (const item of group.lastTransactions ?? []) {
        if (!item.signedTransactionInfo) {
          continue;
        }

        const transaction = await this.deps.appleBillingGateway.verifySignedTransaction(
          item.signedTransactionInfo,
        );
        const renewal = item.signedRenewalInfo
          ? await this.deps.appleBillingGateway.verifySignedRenewalInfo(
              item.signedRenewalInfo,
            )
          : null;
        const resolvedUserId =
          input.userId ??
          (await this.resolveObservedUserId({
            appAccountToken:
              transaction.appAccountToken ?? renewal?.appAccountToken,
            originalTransactionId:
              transaction.originalTransactionId ?? renewal?.originalTransactionId,
          }));

        if (!resolvedUserId) {
          this.deps.logger.warn("apple.billing.unlinked_status_snapshot", {
            originalTransactionId:
              transaction.originalTransactionId ?? renewal?.originalTransactionId,
          });
          continue;
        }

        await this.applySnapshot({
          notification: input.notification,
          renewal,
          status: item.status,
          transaction,
          userId: resolvedUserId,
        });
        affectedUsers.add(resolvedUserId);
      }
    }

    for (const userId of affectedUsers) {
      const subscriptions =
        await this.deps.appleSubscriptionRepository.listByUserId(userId);
      await this.deps.entitlementService.syncUserEntitlements(
        userId,
        subscriptions,
      );
    }

    return [...affectedUsers];
  }

  private async resolveObservedUserId(input: {
    appAccountToken: string | undefined;
    originalTransactionId: string | undefined;
  }) {
    if (input.appAccountToken) {
      const customer =
        await this.deps.billingCustomerRepository.findByAppAccountToken(
          input.appAccountToken,
        );

      if (customer) {
        return customer.userId;
      }
    }

    if (input.originalTransactionId) {
      const subscription =
        await this.deps.appleSubscriptionRepository.findByOriginalTransactionId(
          input.originalTransactionId,
        );

      if (subscription) {
        return subscription.userId;
      }
    }

    return null;
  }

  private requireCatalogItem(productId: string | undefined, code: string) {
    if (!productId) {
      throw new AppError(400, code, "The Apple transaction is missing a product.");
    }

    const item = this.productCatalogByProductId.get(productId);

    if (!item) {
      throw new AppError(
        400,
        code,
        "This Apple product is not configured for premium access.",
      );
    }

    return item;
  }

  private requireGateway() {
    if (this.deps.appleBillingGateway.isEnabled()) {
      return;
    }

    throw new AppError(
      503,
      "APPLE_BILLING_UNAVAILABLE",
      "Apple billing is not configured on this server.",
    );
  }
}
