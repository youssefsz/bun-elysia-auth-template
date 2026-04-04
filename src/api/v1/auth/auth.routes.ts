import { Elysia, t } from "elysia";
import type { AppConfig } from "../../../config/env";
import { clearSessionCookie, setSessionCookie } from "../../../core/auth/session-cookie";
import type { AuthGuard } from "../../../middleware/auth/auth-guard";
import type { RequestRateLimiter } from "../../../middleware/security/rate-limiter";
import type { AuthService } from "../../../services/auth-service/auth.service";

interface AuthRouteDependencies {
  authGuard: AuthGuard;
  authService: AuthService;
  config: AppConfig;
  rateLimiter: RequestRateLimiter;
}

const googleAuthBody = t.Object({
  idToken: t.String({ minLength: 1, maxLength: 8_192 }),
});

export const createAuthRoutes = (deps: AuthRouteDependencies) =>
  new Elysia({ prefix: "/auth" })
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
