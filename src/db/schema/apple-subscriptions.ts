import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const appleSubscriptionsTable = pgTable(
  "apple_subscriptions",
  {
    appAccountToken: text("app_account_token"),
    appTransactionId: text("app_transaction_id"),
    autoRenewEnabled: boolean("auto_renew_enabled"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    environment: text("environment").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    gracePeriodExpiresAt: timestamp("grace_period_expires_at", {
      withTimezone: true,
    }),
    id: text("id").primaryKey(),
    isInBillingRetryPeriod: boolean("is_in_billing_retry_period")
      .default(false)
      .notNull(),
    lastNotificationSubtype: text("last_notification_subtype"),
    lastNotificationType: text("last_notification_type"),
    lastPurchasedAt: timestamp("last_purchased_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    latestTransactionId: text("latest_transaction_id"),
    originalPurchasedAt: timestamp("original_purchased_at", {
      withTimezone: true,
    }),
    originalTransactionId: text("original_transaction_id").notNull(),
    planKey: text("plan_key").notNull(),
    productId: text("product_id").notNull(),
    revocationReason: text("revocation_reason"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    status: text("status").notNull(),
    subscriptionGroupIdentifier: text("subscription_group_identifier"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (table) => ({
    latestTransactionIdIndex: uniqueIndex(
      "apple_subscriptions_latest_transaction_id_unique",
    ).on(table.latestTransactionId),
    originalTransactionIdIndex: uniqueIndex(
      "apple_subscriptions_original_transaction_id_unique",
    ).on(table.originalTransactionId),
  }),
);
