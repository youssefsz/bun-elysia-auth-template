const parseNumber = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const parseCookieSameSite = (
  value: string | undefined,
  fallback: "lax" | "strict" | "none",
) => {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "lax" || normalized === "strict" || normalized === "none") {
    return normalized;
  }

  return fallback;
};

const parseCsv = (value: string | undefined, fallback: string[]) => {
  if (!value) {
    return fallback;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : fallback;
};

export interface AppConfig {
  allowedCorsOrigins: string[];
  databaseUrl?: string;
  envName: string;
  googleClientId?: string;
  isProduction: boolean;
  maxRequestBodySizeBytes: number;
  port: number;
  rateLimitAccountPerMinute: number;
  rateLimitAuthPerMinute: number;
  sessionCookieName: string;
  sessionCookieSameSite: "lax" | "strict" | "none";
  sessionIssuer: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  trustProxyHeaders: boolean;
}

export const loadConfig = (): AppConfig => {
  const envName = Bun.env.NODE_ENV ?? "development";
  const isProduction = envName === "production";

  return {
    allowedCorsOrigins: parseCsv(Bun.env.CORS_ORIGINS, ["*"]),
    databaseUrl: Bun.env.DATABASE_URL,
    envName,
    googleClientId: Bun.env.GOOGLE_CLIENT_ID,
    isProduction,
    maxRequestBodySizeBytes: parseNumber(
      Bun.env.MAX_REQUEST_BODY_SIZE_BYTES,
      64 * 1024,
    ),
    port: parseNumber(Bun.env.PORT, 3000),
    rateLimitAccountPerMinute: parseNumber(
      Bun.env.RATE_LIMIT_ACCOUNT_PER_MINUTE,
      60,
    ),
    rateLimitAuthPerMinute: parseNumber(Bun.env.RATE_LIMIT_AUTH_PER_MINUTE, 10),
    sessionCookieName: Bun.env.SESSION_COOKIE_NAME ?? "auth_template_session",
    sessionCookieSameSite: parseCookieSameSite(
      Bun.env.SESSION_COOKIE_SAME_SITE,
      isProduction ? "none" : "lax",
    ),
    sessionIssuer: Bun.env.SESSION_ISSUER ?? "elysia-auth-template",
    sessionSecret:
      Bun.env.SESSION_SECRET ??
      "dev-session-secret-change-me-before-production",
    sessionTtlSeconds: parseNumber(Bun.env.SESSION_TTL_SECONDS, 60 * 60 * 24 * 7),
    trustProxyHeaders: parseBoolean(Bun.env.TRUST_PROXY_HEADERS, false),
  };
};
