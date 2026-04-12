import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userEntitlementsTable = pgTable(
  "user_entitlements",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    featureKey: text("feature_key").notNull(),
    id: text("id").primaryKey(),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    planKey: text("plan_key"),
    productId: text("product_id"),
    source: text("source").notNull(),
    sourceEnvironment: text("source_environment"),
    sourceOriginalTransactionId: text("source_original_transaction_id"),
    status: text("status").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (table) => ({
    userFeatureIndex: uniqueIndex("user_entitlements_user_feature_unique").on(
      table.userId,
      table.featureKey,
    ),
  }),
);
