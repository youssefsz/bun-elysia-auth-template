import { Elysia, t } from "elysia";
import type { AppConfig } from "../../../config/env";
import { clearSessionCookie, setSessionCookie } from "../../../core/auth/session-cookie";
import type { AuthGuard } from "../../../middleware/auth/auth-guard";
import type { RequestRateLimiter } from "../../../middleware/security/rate-limiter";
import type { AuthService } from "../../../services/auth-service/auth.service";
import { buildPublicBaseUrl } from "../../../utils/http";

interface AuthRouteDependencies {
  authGuard: AuthGuard;
  authService: AuthService;
  config: AppConfig;
  rateLimiter: RequestRateLimiter;
}

const emailVerificationRequestBody = t.Object({
  email: t.String({ format: "email", maxLength: 320 }),
});

const googleAuthBody = t.Object({
  idToken: t.String({ minLength: 1, maxLength: 8_192 }),
});

const loginBody = t.Object({
  email: t.String({ format: "email", maxLength: 320 }),
  password: t.String({ minLength: 8, maxLength: 128 }),
});

const registerBody = t.Object({
  email: t.String({ format: "email", maxLength: 320 }),
  name: t.String({ minLength: 1, maxLength: 120 }),
  password: t.String({ minLength: 8, maxLength: 128 }),
});

const verifyEmailBody = t.Object({
  token: t.String({ minLength: 1, maxLength: 512 }),
});

const verifyEmailQuery = t.Object({
  token: t.String({ minLength: 1, maxLength: 512 }),
});

const resolvePublicBaseUrl = (request: Request, config: AppConfig) =>
  buildPublicBaseUrl(request, {
    isProduction: config.isProduction,
    trustProxyHeaders: config.trustProxyHeaders,
  });

export const createAuthRoutes = (deps: AuthRouteDependencies) =>
  new Elysia({ prefix: "/auth" })
    .post(
      "/register",
      async ({ body, request, set, server }) => {
        deps.rateLimiter.enforce("auth", request, set, server);

        return deps.authService.registerWithEmailPassword(
          body,
          resolvePublicBaseUrl(request, deps.config),
        );
      },
      {
        body: registerBody,
      },
    )
    .post(
      "/login",
      async ({ body, cookie, request, set, server }) => {
        deps.rateLimiter.enforce("auth", request, set, server);

        const result = await deps.authService.loginWithEmailPassword(body);

        setSessionCookie(cookie, deps.config, result.sessionToken);

        return {
          user: result.user,
        };
      },
      {
        body: loginBody,
      },
    )
    .post(
      "/verify-email/request",
      async ({ body, request, set, server }) => {
        deps.rateLimiter.enforce("auth", request, set, server);

        return deps.authService.requestEmailVerification(
          body.email,
          resolvePublicBaseUrl(request, deps.config),
        );
      },
      {
        body: emailVerificationRequestBody,
      },
    )
    .post(
      "/verify-email/confirm",
      async ({ body, cookie, request, set, server }) => {
        deps.rateLimiter.enforce("auth", request, set, server);

        const result = await deps.authService.verifyEmailToken(body.token);

        setSessionCookie(cookie, deps.config, result.sessionToken);

        return {
          user: result.user,
        };
      },
      {
        body: verifyEmailBody,
      },
    )
    .get(
      "/verify-email",
      async ({ cookie, query, request, set, server }) => {
        deps.rateLimiter.enforce("auth", request, set, server);

        const result = await deps.authService.verifyEmailToken(query.token);

        setSessionCookie(cookie, deps.config, result.sessionToken);

        return {
          user: result.user,
        };
      },
      {
        query: verifyEmailQuery,
      },
    )
    .post(
      "/providers/google",
      async ({ body, cookie, request, set, server }) => {
        deps.rateLimiter.enforce("auth", request, set, server);

        const result = await deps.authService.signInWithProvider(
          "google",
          body.idToken,
        );

        setSessionCookie(cookie, deps.config, result.sessionToken);

        return {
          user: result.user,
        };
      },
      {
        body: googleAuthBody,
      },
    )
    .get("/session", async ({ cookie }) => {
      const token = deps.authGuard.readSessionToken(cookie);
      const user = await deps.authService.getAuthenticatedUser(token);

      return {
        authenticated: Boolean(user),
        user,
      };
    })
    .get("/providers", async ({ cookie, request, set, server }) => {
      deps.rateLimiter.enforce("account", request, set, server);

      const user = await deps.authGuard.require(cookie);

      return {
        providers: await deps.authService.getProviderOverview(user.id),
      };
    })
    .post("/logout", async ({ cookie, request, set, server }) => {
      deps.rateLimiter.enforce("auth", request, set, server);
      clearSessionCookie(cookie, deps.config);

      return {
        success: true,
      };
    })
    .post("/logout-all", async ({ cookie, request, set, server }) => {
      deps.rateLimiter.enforce("auth", request, set, server);

      const user = await deps.authGuard.require(cookie);

      await deps.authService.logoutAllSessions(user.id);
      clearSessionCookie(cookie, deps.config);

      return {
        success: true,
      };
    });
