import { Elysia } from "elysia";
import type { AppConfig } from "../../../config/env";
import type { AuthGuard } from "../../../middleware/auth/auth-guard";
import { enforceTrustedBrowserOrigin } from "../../../middleware/security/browser-origin";
import type { RequestRateLimiter } from "../../../middleware/security/rate-limiter";
import {
  appleNotificationBodySchema,
  appleSubscriptionSyncBodySchema,
} from "../../../schemas/billing.schemas";
import { AppleBillingService } from "../../../services/billing-service/apple-billing.service";

interface BillingRouteDependencies {
  appleBillingService: AppleBillingService;
  authGuard: AuthGuard;
  config: AppConfig;
  rateLimiter: RequestRateLimiter;
}

export const createBillingRoutes = (deps: BillingRouteDependencies) =>
  new Elysia({ prefix: "/billing" })
    .get("/entitlements", async ({ cookie, request, set, server }) => {
      deps.rateLimiter.enforce("account", request, set, server);

      const user = await deps.authGuard.require({
        cookie,
        headers: request.headers,
      });

      return deps.appleBillingService.getBillingOverview(user.id);
    })
    .post("/apple/subscriptions/sync", async ({ body, cookie, request, set, server }) => {
      deps.rateLimiter.enforce("auth", request, set, server);
      enforceTrustedBrowserOrigin(request, deps.config);

      const user = await deps.authGuard.require({
        cookie,
        headers: request.headers,
      });
      const parsedBody = appleSubscriptionSyncBodySchema.parse(body);

      return deps.appleBillingService.syncSubscriptionFromApp({
        signedTransactionInfo: parsedBody.signedTransactionInfo,
        userId: user.id,
      });
    })
    .post("/apple/notifications", async ({ body }) => {
      const parsedBody = appleNotificationBodySchema.parse(body);

      return deps.appleBillingService.handleNotification(parsedBody.signedPayload);
    });
