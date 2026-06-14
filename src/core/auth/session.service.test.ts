import { describe, expect, it } from "bun:test";
import { SessionService } from "./session.service";

const userId = "019535d9-3df7-79fb-b466-fa907fa17f9e";

describe("SessionService", () => {
  it("signs and verifies session tokens", async () => {
    const service = new SessionService({
      allowedCorsOrigins: ["*"],
      appPublicUrl: "https://api.example.com",
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
      passwordResetFrontendPath: "/reset-password",
      passwordResetTtlSeconds: 60 * 60,
      port: 3000,
      rateLimitAccountPerMinute: 60,
      rateLimitAuthEmailPerMinute: 5,
      rateLimitAuthPerMinute: 10,
      resendApiKey: undefined,
      resendFromEmail: undefined,
      resendFromName: undefined,
      sessionCookieName: "auth_session",
      sessionCookieSameSite: "lax",
      sessionIssuer: "bun-elysia-auth",
      sessionSecret: "super-secret",
      sessionTtlSeconds: 3600,
      trustProxyHeaders: false,
    });

    const token = await service.sign({
      createdAt: new Date(),
      email: "user@example.com",
      emailVerified: true,
      id: userId,
      name: "User",
      sessionVersion: 1,
      updatedAt: new Date(),
    });
    const payload = await service.verify(token);

    expect(payload.email).toBe("user@example.com");
    expect(payload.userId).toBe(userId);
    expect(payload.sessionVersion).toBe(1);
    expect(payload.issuedAt).toBeInstanceOf(Date);
    expect(payload.expiresAt).toBeInstanceOf(Date);
  });
});
