import { describe, expect, it } from "bun:test";
import { SessionService } from "./session.service";

describe("SessionService", () => {
  it("signs and verifies session tokens", async () => {
    const service = new SessionService({
      allowedCorsOrigins: ["*"],
      envName: "test",
      googleClientId: undefined,
      isProduction: false,
      maxRequestBodySizeBytes: 64 * 1024,
      port: 3000,
      rateLimitAccountPerMinute: 60,
      rateLimitAuthPerMinute: 10,
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
