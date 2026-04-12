import { describe, expect, it } from "bun:test";
import { createRepositories } from "../../core/database/repositories";
import type { BillingProductCatalogItem } from "../../domains/billing/billing.types";
import { EntitlementService } from "./entitlement.service";

const logger = {
  error() {},
  info() {},
  warn() {},
};

const PRODUCT_CATALOG: BillingProductCatalogItem[] = [
  {
    featureKeys: ["genie.chat"],
    planKey: "genie_premium",
    productId: "genie.premium.monthly",
  },
];

describe("EntitlementService", () => {
  it("prefers an active subscription over expired history", async () => {
    const repositories = createRepositories(null, logger);
    const service = new EntitlementService({
      productCatalog: PRODUCT_CATALOG,
      userEntitlementRepository: repositories.userEntitlementRepository,
    });

    await service.syncUserEntitlements("user_1", [
      {
        appAccountToken: null,
        appTransactionId: null,
        autoRenewEnabled: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        environment: "sandbox",
        expiresAt: new Date("2026-03-01T00:00:00.000Z"),
        gracePeriodExpiresAt: null,
        id: "sub_1",
        isInBillingRetryPeriod: false,
        lastNotificationSubtype: null,
        lastNotificationType: null,
        lastPurchasedAt: new Date("2026-02-01T00:00:00.000Z"),
        lastVerifiedAt: new Date("2026-02-01T00:00:00.000Z"),
        latestTransactionId: "txn_1",
        originalPurchasedAt: new Date("2026-01-01T00:00:00.000Z"),
        originalTransactionId: "orig_1",
        planKey: "genie_premium",
        productId: "genie.premium.monthly",
        revocationReason: null,
        revokedAt: null,
        status: "expired",
        subscriptionGroupIdentifier: "group_1",
        updatedAt: new Date("2026-02-01T00:00:00.000Z"),
        userId: "user_1",
      },
      {
        appAccountToken: null,
        appTransactionId: null,
        autoRenewEnabled: true,
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        environment: "sandbox",
        expiresAt: new Date("2026-04-01T00:00:00.000Z"),
        gracePeriodExpiresAt: null,
        id: "sub_2",
        isInBillingRetryPeriod: false,
        lastNotificationSubtype: null,
        lastNotificationType: null,
        lastPurchasedAt: new Date("2026-03-01T00:00:00.000Z"),
        lastVerifiedAt: new Date("2026-03-01T00:00:00.000Z"),
        latestTransactionId: "txn_2",
        originalPurchasedAt: new Date("2026-01-01T00:00:00.000Z"),
        originalTransactionId: "orig_2",
        planKey: "genie_premium",
        productId: "genie.premium.monthly",
        revocationReason: null,
        revokedAt: null,
        status: "active",
        subscriptionGroupIdentifier: "group_1",
        updatedAt: new Date("2026-03-01T00:00:00.000Z"),
        userId: "user_1",
      },
    ]);

    const { entitlement, hasAccess } = await service.getFeatureAccess(
      "user_1",
      "genie.chat",
    );

    expect(hasAccess).toBe(true);
    expect(entitlement.status).toBe("active");
    expect(entitlement.productId).toBe("genie.premium.monthly");
  });

  it("marks missing features as inactive", async () => {
    const repositories = createRepositories(null, logger);
    const service = new EntitlementService({
      productCatalog: PRODUCT_CATALOG,
      userEntitlementRepository: repositories.userEntitlementRepository,
    });

    await service.syncUserEntitlements("user_2", []);

    const { entitlement, hasAccess } = await service.getFeatureAccess(
      "user_2",
      "genie.chat",
    );

    expect(hasAccess).toBe(false);
    expect(entitlement.status).toBe("inactive");
  });
});
