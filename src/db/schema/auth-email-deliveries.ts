import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const authEmailDeliveriesTable = pgTable(
  "auth_email_deliveries",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    email: text("email").notNull(),
    id: uuid("id").primaryKey(),
    kind: text("kind").notNull(),
  },
  (table) => ({
    emailKindCreatedAtIndex: index(
      "auth_email_deliveries_email_kind_created_at_idx",
    ).on(table.email, table.kind, table.createdAt),
  }),
);
