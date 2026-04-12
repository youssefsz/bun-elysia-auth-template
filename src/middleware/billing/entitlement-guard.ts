import type { Cookie } from "elysia";
import { EntitlementService, hasEntitlementAccess } from "../../services/entitlement-service/entitlement.service";
import { AppError } from "../../utils/app-error";
import type { AuthGuard } from "../auth/auth-guard";

type CookieStore = Record<string, Cookie<unknown>>;

interface EntitlementContext {
  cookie: CookieStore;
  headers?: Headers;
}

export class EntitlementGuard {
  constructor(
    private readonly authGuard: AuthGuard,
    private readonly entitlementService: EntitlementService,
  ) {}

  async requireFeature(context: EntitlementContext, featureKey: string) {
    const user = await this.authGuard.require(context);
    const { entitlement } = await this.entitlementService.getFeatureAccess(
      user.id,
      featureKey,
    );

    if (!hasEntitlementAccess(entitlement.status)) {
      throw new AppError(
        403,
        "PREMIUM_ACCESS_REQUIRED",
        "An active subscription is required to access this feature.",
      );
    }

    return {
      entitlement,
      user,
    };
  }
}
