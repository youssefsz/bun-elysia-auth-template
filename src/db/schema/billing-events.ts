import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const billingEventsTable = pgTable(
  "billing_events",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    environment: text("environment"),
    externalId: text("external_id").notNull(),
    id: text("id").primaryKey(),
    notificationSubtype: text("notification_subtype"),
    notificationType: text("notification_type"),
    originalTransactionId: text("original_transaction_id"),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull(),
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),
    signedDate: timestamp("signed_date", { withTimezone: true }),
    source: text("source").notNull(),
    transactionId: text("transaction_id"),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  },
  (table) => ({
    sourceExternalIdIndex: uniqueIndex("billing_events_source_external_id_unique").on(
      table.source,
      table.externalId,
    ),
  }),
);
