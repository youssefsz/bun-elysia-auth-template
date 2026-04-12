import { describe, expect, it } from "bun:test";
import { SessionService } from "./session.service";

describe("SessionService", () => {
  it("signs and verifies session tokens", async () => {
    const service = new SessionService({
      allowedCorsOrigins: ["*"],
      appPublicUrl: "https://api.example.com",
      appleEnableOnlineChecks: true,
      appleRootCaPaths: [],
      appleSubscriptionProducts: [],
      appleClientIds: [],
      authEmailMaxPerDay: 10,
      authEmailMaxPerHour: 5,
      authEmailResendCooldownSeconds: 60,
      emailVerificationTtlSeconds: 60 * 60 * 24,
      emailVerificationFrontendPath: "/verify-email",
      envName: "test",
      frontendPublicUrl: "https://app.example.com",
      googleClientIds: [],
      isProduction: false,
      maxRequestBodySizeBytes: 64 * 1024,
      openRouterApiKey: undefined,
      openRouterAppName: undefined,
      openRouterModelId: "openai/gpt-4o-mini",
      openRouterSiteUrl: undefined,
      passwordResetFrontendPath: "/reset-password",
      passwordResetTtlSeconds: 60 * 60,
      port: 3000,
      rateLimitAccountPerMinute: 60,
      rateLimitAuthEmailPerMinute: 5,
      rateLimitAuthPerMinute: 10,
      resendApiKey: undefined,
      resendFromEmail: undefined,
      resendFromName: undefined,
      sessionCookieName: "session",
      sessionCookieSameSite: "lax",
      sessionIssuer: "test-suite",
      sessionSecret: "super-secret",
      sessionTtlSeconds: 3600,
      trustProxyHeaders: false,
    });

    const token = await service.sign({
      createdAt: new Date(),
      email: "user@example.com",
      emailVerified: true,
      id: "user_123",
      name: "User",
      sessionVersion: 1,
      updatedAt: new Date(),
    });
    const payload = await service.verify(token);

    expect(payload.email).toBe("user@example.com");
    expect(payload.userId).toBe("user_123");
    expect(payload.sessionVersion).toBe(1);
    expect(payload.issuedAt).toBeInstanceOf(Date);
    expect(payload.expiresAt).toBeInstanceOf(Date);
  });
});
