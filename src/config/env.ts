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

const parseUrl = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value.trim());
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");

    return url.toString().replace(/\/$/, "");
  } catch {
    return undefined;
  }
};

export interface AppConfig {
  allowedCorsOrigins: string[];
  appPublicUrl?: string;
  authEmailMaxPerDay: number;
  authEmailMaxPerHour: number;
  authEmailResendCooldownSeconds: number;
  databaseUrl?: string;
  emailVerificationFrontendPath: string;
  emailVerificationTtlSeconds: number;
  envName: string;
  frontendPublicUrl?: string;
  googleClientId?: string;
  isProduction: boolean;
  maxRequestBodySizeBytes: number;
  passwordResetFrontendPath: string;
  passwordResetTtlSeconds: number;
  port: number;
  rateLimitAccountPerMinute: number;
  rateLimitAuthEmailPerMinute: number;
  rateLimitAuthPerMinute: number;
  resendApiKey?: string;
  resendFromEmail?: string;
  resendFromName?: string;
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
    appPublicUrl: parseUrl(Bun.env.APP_PUBLIC_URL),
    authEmailMaxPerDay: parseNumber(
      Bun.env.AUTH_EMAIL_MAX_PER_DAY ?? Bun.env.EMAIL_VERIFICATION_MAX_PER_DAY,
      10,
    ),
    authEmailMaxPerHour: parseNumber(
      Bun.env.AUTH_EMAIL_MAX_PER_HOUR ?? Bun.env.EMAIL_VERIFICATION_MAX_PER_HOUR,
      5,
    ),
    authEmailResendCooldownSeconds: parseNumber(
      Bun.env.AUTH_EMAIL_RESEND_COOLDOWN_SECONDS ??
        Bun.env.EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
      60,
    ),
    databaseUrl: Bun.env.DATABASE_URL,
    emailVerificationFrontendPath:
      Bun.env.EMAIL_VERIFICATION_FRONTEND_PATH?.trim() || "/verify-email",
    emailVerificationTtlSeconds: parseNumber(
      Bun.env.EMAIL_VERIFICATION_TTL_SECONDS,
      60 * 60 * 24,
    ),
    envName,
    frontendPublicUrl: parseUrl(Bun.env.FRONTEND_PUBLIC_URL),
    googleClientId: Bun.env.GOOGLE_CLIENT_ID,
    isProduction,
    maxRequestBodySizeBytes: parseNumber(
      Bun.env.MAX_REQUEST_BODY_SIZE_BYTES,
      64 * 1024,
    ),
    passwordResetFrontendPath:
      Bun.env.PASSWORD_RESET_FRONTEND_PATH?.trim() || "/reset-password",
    passwordResetTtlSeconds: parseNumber(
      Bun.env.PASSWORD_RESET_TTL_SECONDS,
      60 * 60,
    ),
    port: parseNumber(Bun.env.PORT, 3000),
    rateLimitAccountPerMinute: parseNumber(
      Bun.env.RATE_LIMIT_ACCOUNT_PER_MINUTE,
      60,
    ),
    rateLimitAuthEmailPerMinute: parseNumber(
      Bun.env.RATE_LIMIT_AUTH_EMAIL_PER_MINUTE ??
        Bun.env.RATE_LIMIT_VERIFICATION_EMAIL_PER_MINUTE,
      5,
    ),
    rateLimitAuthPerMinute: parseNumber(Bun.env.RATE_LIMIT_AUTH_PER_MINUTE, 10),
    resendApiKey: Bun.env.RESEND_API_KEY,
    resendFromEmail: Bun.env.RESEND_FROM_EMAIL,
    resendFromName: Bun.env.RESEND_FROM_NAME,
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
