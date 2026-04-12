import { describe, expect, it } from "bun:test";
import type { Cookie } from "elysia";
import { EntitlementGuard } from "./entitlement-guard";

const makeCookieStore = () =>
  ({
    session: {
      value: "session-token",
    },
  }) as unknown as Record<string, Cookie<unknown>>;

describe("EntitlementGuard", () => {
  it("allows access when the entitlement is active", async () => {
    const guard = new EntitlementGuard(
      {
        async require() {
          return {
            createdAt: new Date(),
            email: "user@example.com",
            emailVerified: true,
            id: "user_1",
            name: "User",
            sessionVersion: 1,
            updatedAt: new Date(),
          };
        },
      } as any,
      {
        async getFeatureAccess() {
          return {
            entitlement: {
              status: "active",
            },
            hasAccess: true,
          };
        },
      } as any,
    );

    const result = await guard.requireFeature(
      {
        cookie: makeCookieStore(),
      },
      "genie.chat",
    );

    expect(result.user.id).toBe("user_1");
  });

  it("blocks access when the entitlement is inactive", async () => {
    const guard = new EntitlementGuard(
      {
        async require() {
          return {
            createdAt: new Date(),
            email: "user@example.com",
            emailVerified: true,
            id: "user_1",
            name: "User",
            sessionVersion: 1,
            updatedAt: new Date(),
          };
        },
      } as any,
      {
        async getFeatureAccess() {
          return {
            entitlement: {
              status: "inactive",
            },
            hasAccess: false,
          };
        },
      } as any,
    );

    await expect(
      guard.requireFeature(
        {
          cookie: makeCookieStore(),
        },
        "genie.chat",
      ),
    ).rejects.toMatchObject({
      code: "PREMIUM_ACCESS_REQUIRED",
      status: 403,
    });
  });
});
