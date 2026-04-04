import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const localAuthCredentialsTable = pgTable(
  "local_auth_credentials",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    userId: text("user_id")
      .primaryKey()
      .references(() => usersTable.id, { onDelete: "cascade" }),
  },
  (table) => ({
    userIndex: uniqueIndex("local_auth_credentials_user_unique").on(table.userId),
  }),
);
