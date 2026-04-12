import { Elysia } from "elysia";
import type { EntitlementGuard } from "../../../middleware/billing/entitlement-guard";
import type { RequestRateLimiter } from "../../../middleware/security/rate-limiter";
import { genieChatBodySchema } from "../../../schemas/genie.schemas";
import { GenieService } from "../../../services/genie-service/genie.service";

interface GenieRouteDependencies {
  entitlementGuard: EntitlementGuard;
  genieService: GenieService;
  rateLimiter: RequestRateLimiter;
}

export const createGenieRoutes = (deps: GenieRouteDependencies) =>
  new Elysia({ prefix: "/genie" }).post(
    "/chat",
    async ({ body, cookie, request, set, server }) => {
      deps.rateLimiter.enforce("account", request, set, server);

      const { user } = await deps.entitlementGuard.requireFeature(
        {
          cookie,
          headers: request.headers,
        },
        "genie.chat",
      );
      const parsedBody = genieChatBodySchema.parse(body);

      return deps.genieService.createReply({
        conversationId: parsedBody.conversationId,
        history: parsedBody.history,
        inputText: parsedBody.inputText,
        remainingWishes: parsedBody.remainingWishes,
        userId: user.id,
      });
    },
  );
