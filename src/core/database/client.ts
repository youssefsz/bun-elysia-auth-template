import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { AppConfig } from "../../config/env";
import * as schema from "../../db/schema";
import type { Logger } from "../../utils/logger";

export const createDatabaseClient = (config: AppConfig, logger: Logger) => {
  if (!config.databaseUrl) {
    logger.warn("database.disabled", {
      reason: "DATABASE_URL is not configured; using in-memory repositories.",
    });

    return {
      db: null,
      sql: null,
    };
  }

  const sql = postgres(config.databaseUrl, {
    max: 10,
    prepare: false,
  });

  return {
    db: drizzle(sql, { schema }),
    sql,
  };
};
