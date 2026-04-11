import { Elysia } from "elysia";
import { createAccountRoutes } from "./api/v1/account/account.routes";
import { createAuthRoutes } from "./api/v1/auth/auth.routes";
import type { AppConfig } from "./config/env";
import { loadConfig } from "./config/env";
import { validateConfig } from "./config/env";
import { AuthProviderRegistry } from "./core/auth/auth-provider-registry";
import { GoogleTokenVerifier } from "./core/auth/google-token-verifier";
import { SessionService } from "./core/auth/session.service";
import { createDatabaseClient } from "./core/database/client";
import { createRepositories } from "./core/database/repositories";
import type { TransactionalEmailClient } from "./core/email/resend-email-client";
import { ResendEmailClient } from "./core/email/resend-email-client";
import { AuthGuard } from "./middleware/auth/auth-guard";
import { RequestRateLimiter } from "./middleware/security/rate-limiter";
import { AccountService } from "./services/account-service/account.service";
import { AuthService } from "./services/auth-service/auth.service";
import { AppError } from "./utils/app-error";
import { createErrorResponse, mapToAppError, requestPath } from "./utils/http";
import type { Logger } from "./utils/logger";
import { createLogger } from "./utils/logger";

const isPrivateCorsPath = (path: string) =>
  path === "/api" || path.startsWith("/api/");

const isAllowedPrivateOrigin = (origin: string, allowedOrigins: string[]) =>
  allowedOrigins.includes("*") || allowedOrigins.includes(origin);

const setVaryHeader = (
  headers: Record<string, string | number>,
  value: string,
) => {
  const current = headers.vary;

  if (!current) {
    headers.vary = value;
    return;
  }

  const values = String(current)
    .split(",")
    .map((item) => item.trim().toLowerCase());

  if (!values.includes(value.toLowerCase())) {
    headers.vary = `${current}, ${value}`;
  }
};

const applyCorsHeaders = ({
  headers,
  origin,
}: {
  headers: Record<string, string | number>;
  origin: string;
}) => {
  headers["access-control-allow-origin"] = origin;
  headers["access-control-allow-methods"] = "GET, POST, PATCH, DELETE, OPTIONS";
  headers["access-control-allow-credentials"] = "true";

  setVaryHeader(headers, "Origin");
};

const buildPreflightHeaders = ({
  origin,
  requestHeaders,
}: {
  origin: string;
  requestHeaders: string | null;
}) => {
  const headers: Record<string, string> = {};

  applyCorsHeaders({ headers, origin });
  headers["access-control-max-age"] = "300";

  if (requestHeaders) {
    headers["access-control-allow-headers"] = requestHeaders;
    setVaryHeader(headers, "Access-Control-Request-Headers");
  }

  return headers;
};

interface CreateAppOptions {
  authProviderRegistry?: AuthProviderRegistry;
  config?: AppConfig;
  emailClient?: TransactionalEmailClient;
  logger?: Logger;
}

export const createApp = (options: CreateAppOptions = {}) => {
  const config = validateConfig(options.config ?? loadConfig());
  const logger = options.logger ?? createLogger(config.envName);
  const requestTimings = new WeakMap<Request, number>();
  const database = createDatabaseClient(config, logger);
  const repositories = createRepositories(database.db, logger);
  const emailClient = options.emailClient ?? new ResendEmailClient(config);
  const authProviderRegistry =
    options.authProviderRegistry ??
    new AuthProviderRegistry([new GoogleTokenVerifier(config)]);
  const sessionService = new SessionService(config);
  const authService = new AuthService({
    authEmailDeliveryRepository: repositories.authEmailDeliveryRepository,
    authProviderRegistry,
    authProviderRepository: repositories.authProviderRepository,
    config,
    emailClient,
    emailVerificationTokenRepository:
      repositories.emailVerificationTokenRepository,
    localAuthCredentialRepository: repositories.localAuthCredentialRepository,
    logger,
    passwordResetTokenRepository: repositories.passwordResetTokenRepository,
    sessionService,
    userRepository: repositories.userRepository,
  });
  const accountService = new AccountService({
    authProviderRepository: repositories.authProviderRepository,
    authEmailDeliveryRepository: repositories.authEmailDeliveryRepository,
    emailVerificationTokenRepository:
      repositories.emailVerificationTokenRepository,
    localAuthCredentialRepository: repositories.localAuthCredentialRepository,
    passwordResetTokenRepository: repositories.passwordResetTokenRepository,
    userRepository: repositories.userRepository,
  });
  const authGuard = new AuthGuard(authService, config.sessionCookieName);
  const rateLimiter = new RequestRateLimiter(
    {
      account: { limit: config.rateLimitAccountPerMinute, windowMs: 60_000 },
      auth: { limit: config.rateLimitAuthPerMinute, windowMs: 60_000 },
      authEmail: {
        limit: config.rateLimitAuthEmailPerMinute,
        windowMs: 60_000,
      },
    },
    logger,
    {
      trustProxyHeaders: config.trustProxyHeaders,
    },
  );

  const app = new Elysia()
    .onRequest(({ request }) => {
      requestTimings.set(request, Date.now());

      const origin = request.headers.get("origin");
      const path = requestPath(request);

      if (!origin || request.method !== "OPTIONS" || !isPrivateCorsPath(path)) {
        return;
      }

      if (!isAllowedPrivateOrigin(origin, config.allowedCorsOrigins)) {
        return new Response(null, {
          status: 403,
        });
      }

      return new Response(null, {
        status: 204,
        headers: buildPreflightHeaders({
          origin,
          requestHeaders: request.headers.get("access-control-request-headers"),
        }),
      });
    })
    .onAfterHandle(({ request, set }) => {
      const origin = request.headers.get("origin");
      const path = requestPath(request);

      if (
        origin &&
        isPrivateCorsPath(path) &&
        isAllowedPrivateOrigin(origin, config.allowedCorsOrigins)
      ) {
        applyCorsHeaders({
          headers: set.headers,
          origin,
        });
      }

      logger.info("request.completed", {
        durationMs: Date.now() - (requestTimings.get(request) ?? Date.now()),
        method: request.method,
        path: requestPath(request),
        status: set.status ?? 200,
      });
    })
    .onError(({ code, error, request, set }) => {
      const appError = mapToAppError(code, error);
      const origin = request.headers.get("origin");
      const path = requestPath(request);

      logger.error("request.failed", {
        durationMs: Date.now() - (requestTimings.get(request) ?? Date.now()),
        method: request.method,
        path,
        status: appError.status,
        code: appError.code,
        details: appError.details,
      });

      if (
        origin &&
        isPrivateCorsPath(path) &&
        isAllowedPrivateOrigin(origin, config.allowedCorsOrigins)
      ) {
        applyCorsHeaders({
          headers: set.headers,
          origin,
        });
      }

      set.status = appError.status;

      return createErrorResponse(appError);
    })
    .get("/", () => ({
      service: "tricky-genie",
      status: "ok",
      version: "v1",
    }))
    .get("/api", () => ({
      availableVersions: ["/api/v1"],
      status: "ok",
    }))
    .get("/api/v1", () => ({
      routes: {
        account: [
          "GET /api/v1/account",
          "PATCH /api/v1/account",
          "DELETE /api/v1/account",
        ],
        auth: [
          "POST /api/v1/auth/register",
          "POST /api/v1/auth/login",
          "POST /api/v1/auth/verify-email/request",
          "POST /api/v1/auth/verify-email/confirm",
          "GET /api/v1/auth/verify-email",
          "POST /api/v1/auth/password-reset/request",
          "POST /api/v1/auth/password-reset/confirm",
          "POST /api/v1/auth/providers/google",
          "GET /api/v1/auth/providers",
          "GET /api/v1/auth/session",
          "POST /api/v1/auth/logout",
          "POST /api/v1/auth/logout-all",
        ],
      },
      status: "ok",
      version: "v1",
    }))
    .get("/health", () => ({
      status: "ok",
    }))
    .group("/api/v1", (api) =>
      api
        .use(
          createAuthRoutes({
            authGuard,
            authService,
            config,
            rateLimiter,
          }),
        )
        .use(
          createAccountRoutes({
            accountService,
            authGuard,
            config,
            rateLimiter,
          }),
        ),
    );

  return {
    accountService,
    app,
    authProviderRegistry,
    authService,
    config,
    database,
    emailClient,
    logger,
    rateLimiter,
    repositories,
    sessionService,
  };
};

export type AppInstance = ReturnType<typeof createApp>;

export const assertAppError = (error: unknown) =>
  error instanceof AppError ? error : mapToAppError("UNKNOWN", error);
