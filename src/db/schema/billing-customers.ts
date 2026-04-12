import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const billingCustomersTable = pgTable(
  "billing_customers",
  {
    appAccountToken: text("app_account_token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (table) => ({
    appAccountTokenIndex: uniqueIndex(
      "billing_customers_app_account_token_unique",
    ).on(table.appAccountToken),
    userIdIndex: uniqueIndex("billing_customers_user_id_unique").on(table.userId),
  }),
);
