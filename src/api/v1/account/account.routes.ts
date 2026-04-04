import { Elysia } from "elysia";
import type { AppConfig } from "../../../config/env";
import { clearSessionCookie } from "../../../core/auth/session-cookie";
import type { AuthGuard } from "../../../middleware/auth/auth-guard";
import type { RequestRateLimiter } from "../../../middleware/security/rate-limiter";
import {
  deleteAccountBodySchema,
  updateAccountBodySchema,
} from "../../../schemas/account.schemas";
import type { AccountService } from "../../../services/account-service/account.service";

interface AccountRouteDependencies {
  accountService: AccountService;
  authGuard: AuthGuard;
  config: AppConfig;
  rateLimiter: RequestRateLimiter;
}

export const createAccountRoutes = (deps: AccountRouteDependencies) =>
  new Elysia({ prefix: "/account" })
    .get("/", async ({ cookie, request, set, server }) => {
      deps.rateLimiter.enforce("account", request, set, server);

      const user = await deps.authGuard.require(cookie);

      return {
        account: await deps.accountService.getAccount(user.id),
      };
    })
    .patch("/", async ({ body, cookie, request, set, server }) => {
      deps.rateLimiter.enforce("account", request, set, server);

      const user = await deps.authGuard.require(cookie);
      const parsedBody = updateAccountBodySchema.parse(body);

      return {
        account: await deps.accountService.updateAccount(user.id, parsedBody),
      };
    })
    .delete("/", async ({ body, cookie, request, set, server }) => {
      deps.rateLimiter.enforce("auth", request, set, server);

      const user = await deps.authGuard.require(cookie);
      const parsedBody = deleteAccountBodySchema.parse(body);
      const result = await deps.accountService.deleteAccount(
        user.id,
        parsedBody.confirmEmail,
      );

      clearSessionCookie(cookie, deps.config);

      return result;
    });
