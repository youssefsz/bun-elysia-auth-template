import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const appleTransactionsTable = pgTable(
  "apple_transactions",
  {
    appAccountToken: text("app_account_token"),
    appTransactionId: text("app_transaction_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    currency: text("currency"),
    environment: text("environment").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    inAppOwnershipType: text("in_app_ownership_type"),
    isUpgraded: boolean("is_upgraded").default(false).notNull(),
    originalPurchaseDate: timestamp("original_purchase_date", {
      withTimezone: true,
    }),
    originalTransactionId: text("original_transaction_id").notNull(),
    priceInMilliunits: integer("price_in_milliunits"),
    productId: text("product_id").notNull(),
    purchaseDate: timestamp("purchase_date", { withTimezone: true }).notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    revocationReason: text("revocation_reason"),
    revocationType: text("revocation_type"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    transactionId: text("transaction_id").notNull(),
    transactionReason: text("transaction_reason"),
    type: text("type").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    webOrderLineItemId: text("web_order_line_item_id"),
  },
  (table) => ({
    transactionIdIndex: uniqueIndex("apple_transactions_transaction_id_unique").on(
      table.transactionId,
    ),
  }),
);
