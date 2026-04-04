import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const emailVerificationTokensTable = pgTable(
  "email_verification_tokens",
  {
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    pendingName: text("pending_name"),
    pendingPasswordHash: text("pending_password_hash").notNull(),
    tokenHash: text("token_hash").notNull(),
    userId: text("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
  },
  (table) => ({
    tokenHashIndex: uniqueIndex("email_verification_tokens_hash_unique").on(
      table.tokenHash,
    ),
  }),
);
