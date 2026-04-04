import { Elysia } from "elysia";
import type { AppConfig } from "../../../config/env";
import { clearSessionCookie, setSessionCookie } from "../../../core/auth/session-cookie";
import type { AuthGuard } from "../../../middleware/auth/auth-guard";
import type { RequestRateLimiter } from "../../../middleware/security/rate-limiter";
import {
  emailVerificationRequestBodySchema,
  googleAuthBodySchema,
  loginBodySchema,
  passwordResetConfirmBodySchema,
  passwordResetRequestBodySchema,
  registerBodySchema,
  verifyEmailBodySchema,
  verifyEmailQuerySchema,
} from "../../../schemas/auth.schemas";
import type { AuthService } from "../../../services/auth-service/auth.service";
import { buildPublicBaseUrl } from "../../../utils/http";

interface AuthRouteDependencies {
  authGuard: AuthGuard;
  authService: AuthService;
  config: AppConfig;
  rateLimiter: RequestRateLimiter;
}

const resolvePublicBaseUrl = (request: Request, config: AppConfig) =>
  config.appPublicUrl ??
  buildPublicBaseUrl(request, {
    isProduction: config.isProduction,
    trustProxyHeaders: config.trustProxyHeaders,
  });

export const createAuthRoutes = (deps: AuthRouteDependencies) =>
  new Elysia({ prefix: "/auth" })
    .post("/register", async ({ body, request, set, server }) => {
      deps.rateLimiter.enforce("auth", request, set, server);

      const parsedBody = registerBodySchema.parse(body);

      return deps.authService.registerWithEmailPassword(
        parsedBody,
        resolvePublicBaseUrl(request, deps.config),
      );
    })
    .post("/login", async ({ body, cookie, request, set, server }) => {
      deps.rateLimiter.enforce("auth", request, set, server);

      const parsedBody = loginBodySchema.parse(body);
      const result = await deps.authService.loginWithEmailPassword(parsedBody);

      setSessionCookie(cookie, deps.config, result.sessionToken);

      return {
        user: result.user,
      };
    })
    .post("/verify-email/request", async ({ body, request, set, server }) => {
      deps.rateLimiter.enforce("authEmail", request, set, server);

      const parsedBody = emailVerificationRequestBodySchema.parse(body);

      return deps.authService.requestEmailVerification(
        parsedBody.email,
        resolvePublicBaseUrl(request, deps.config),
      );
    })
    .post("/verify-email/confirm", async ({ body, cookie, request, set, server }) => {
      deps.rateLimiter.enforce("auth", request, set, server);

      const parsedBody = verifyEmailBodySchema.parse(body);
      const result = await deps.authService.verifyEmailToken(parsedBody.token);

      if (result.status === "verified") {
        setSessionCookie(cookie, deps.config, result.sessionToken);
      }

      return result.status === "verified"
        ? {
            status: result.status,
            user: result.user,
          }
        : {
            status: result.status,
          };
    })
    .get("/verify-email", async ({ cookie, query, request, set, server }) => {
      deps.rateLimiter.enforce("auth", request, set, server);

      const parsedQuery = verifyEmailQuerySchema.parse(query);

      if (deps.config.frontendPublicUrl) {
        const redirectUrl = new URL(
          deps.config.emailVerificationFrontendPath,
          `${deps.config.frontendPublicUrl.replace(/\/$/, "")}/`,
        );
        redirectUrl.searchParams.set("token", parsedQuery.token);
        set.status = 303;
        set.headers.location = redirectUrl.toString();

        return new Response(null, {
          headers: {
            location: redirectUrl.toString(),
          },
          status: 303,
        });
      }

      const result = await deps.authService.verifyEmailToken(parsedQuery.token);

      if (result.status === "verified") {
        setSessionCookie(cookie, deps.config, result.sessionToken);
      }

      return result.status === "verified"
        ? {
            status: result.status,
            user: result.user,
          }
        : {
            status: result.status,
          };
    })
    .post("/password-reset/request", async ({ body, request, set, server }) => {
      deps.rateLimiter.enforce("authEmail", request, set, server);

      const parsedBody = passwordResetRequestBodySchema.parse(body);

      return deps.authService.requestPasswordReset(
        parsedBody.email,
        resolvePublicBaseUrl(request, deps.config),
      );
    })
    .post("/password-reset/confirm", async ({ body, request, set, server }) => {
      deps.rateLimiter.enforce("auth", request, set, server);

      const parsedBody = passwordResetConfirmBodySchema.parse(body);

      return deps.authService.resetPasswordWithToken(parsedBody);
    })
    .post("/providers/google", async ({ body, cookie, request, set, server }) => {
      deps.rateLimiter.enforce("auth", request, set, server);

      const parsedBody = googleAuthBodySchema.parse(body);
      const result = await deps.authService.signInWithProvider(
        "google",
        parsedBody.idToken,
      );

      setSessionCookie(cookie, deps.config, result.sessionToken);

      return {
        user: result.user,
      };
    })
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
