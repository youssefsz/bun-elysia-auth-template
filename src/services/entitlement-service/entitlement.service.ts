import type {
  AppleSubscription,
  BillingProductCatalogItem,
  EntitlementStatus,
  UserEntitlementRepository,
} from "../../domains/billing/billing.types";

const ENTITLEMENT_STATUS_PRIORITY: Record<EntitlementStatus, number> = {
  active: 5,
  grace_period: 4,
  billing_retry: 3,
  expired: 2,
  revoked: 1,
  inactive: 0,
};

export const hasEntitlementAccess = (status: EntitlementStatus) =>
  status === "active" || status === "grace_period";

export const mapSubscriptionToEntitlementStatus = (
  subscription: AppleSubscription,
): EntitlementStatus => subscription.status;

const compareSubscriptionsForEntitlement = (
  left: AppleSubscription,
  right: AppleSubscription,
) => {
  const priorityDifference =
    ENTITLEMENT_STATUS_PRIORITY[mapSubscriptionToEntitlementStatus(right)] -
    ENTITLEMENT_STATUS_PRIORITY[mapSubscriptionToEntitlementStatus(left)];

  if (priorityDifference !== 0) {
    return priorityDifference;
  }

  const leftExpiry = left.expiresAt?.getTime() ?? 0;
  const rightExpiry = right.expiresAt?.getTime() ?? 0;

  if (rightExpiry !== leftExpiry) {
    return rightExpiry - leftExpiry;
  }

  return right.lastVerifiedAt.getTime() - left.lastVerifiedAt.getTime();
};

const listFeatureKeys = (catalog: BillingProductCatalogItem[]) =>
  [...new Set(catalog.flatMap((item) => item.featureKeys))].sort();

interface EntitlementServiceDependencies {
  productCatalog: BillingProductCatalogItem[];
  userEntitlementRepository: UserEntitlementRepository;
}

export class EntitlementService {
  private readonly featureKeys: string[];
  private readonly productCatalogByProductId: Map<string, BillingProductCatalogItem>;

  constructor(private readonly deps: EntitlementServiceDependencies) {
    this.featureKeys = listFeatureKeys(deps.productCatalog);
    this.productCatalogByProductId = new Map(
      deps.productCatalog.map((item) => [item.productId, item]),
    );
  }

  async getFeatureAccess(userId: string, featureKey: string) {
    const entitlement =
      await this.deps.userEntitlementRepository.findByUserIdAndFeatureKey(
        userId,
        featureKey,
      );

    return {
      entitlement: entitlement ?? {
        createdAt: new Date(0),
        expiresAt: null,
        featureKey,
        lastVerifiedAt: new Date(0),
        planKey: null,
        productId: null,
        source: "apple" as const,
        sourceEnvironment: null,
        sourceOriginalTransactionId: null,
        status: "inactive" as const,
        updatedAt: new Date(0),
        userId,
      },
      hasAccess: entitlement ? hasEntitlementAccess(entitlement.status) : false,
    };
  }

  async listUserEntitlements(userId: string) {
    return this.deps.userEntitlementRepository.listByUserId(userId);
  }

  async syncUserEntitlements(userId: string, subscriptions: AppleSubscription[]) {
    const applicableSubscriptions = subscriptions
      .filter((subscription) =>
        this.productCatalogByProductId.has(subscription.productId),
      )
      .sort(compareSubscriptionsForEntitlement);

    for (const featureKey of this.featureKeys) {
      const bestSubscription = applicableSubscriptions.find((subscription) => {
        const catalogItem = this.productCatalogByProductId.get(subscription.productId);

        return catalogItem?.featureKeys.includes(featureKey);
      });

      if (!bestSubscription) {
        await this.deps.userEntitlementRepository.upsert({
          expiresAt: null,
          featureKey,
          lastVerifiedAt: new Date(),
          planKey: null,
          productId: null,
          source: "apple",
          sourceEnvironment: null,
          sourceOriginalTransactionId: null,
          status: "inactive",
          userId,
        });

        continue;
      }

      await this.deps.userEntitlementRepository.upsert({
        expiresAt: bestSubscription.expiresAt,
        featureKey,
        lastVerifiedAt: bestSubscription.lastVerifiedAt,
        planKey: bestSubscription.planKey,
        productId: bestSubscription.productId,
        source: "apple",
        sourceEnvironment: bestSubscription.environment,
        sourceOriginalTransactionId: bestSubscription.originalTransactionId,
        status: mapSubscriptionToEntitlementStatus(bestSubscription),
        userId,
      });
    }

    return this.listUserEntitlements(userId);
  }
}
