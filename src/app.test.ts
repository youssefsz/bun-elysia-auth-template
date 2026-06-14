import { describe, expect, it } from "bun:test";
import { createApp } from "./app";
import {
  AuthProviderRegistry,
  type AuthIdentityVerifier,
} from "./core/auth/auth-provider-registry";
import type {
  SendEmailInput,
  TransactionalEmailClient,
} from "./core/email/resend-email-client";

Bun.env.DATABASE_URL = "";
Bun.env.CORS_ORIGINS = "http://localhost:5173";
Bun.env.GOOGLE_CLIENT_IDS = "";
Bun.env.APPLE_CLIENT_IDS = "";
Bun.env.APP_PUBLIC_URL = "https://api.example.com";
Bun.env.FRONTEND_PUBLIC_URL = "https://app.example.com";
Bun.env.SESSION_COOKIE_NAME = "auth_session";
Bun.env.SESSION_ISSUER = "bun-elysia-auth";
Bun.env.RESEND_API_KEY = "";
Bun.env.RESEND_FROM_EMAIL = "";
Bun.env.RESEND_FROM_NAME = "";

class FakeEmailClient implements TransactionalEmailClient {
  messages: SendEmailInput[] = [];

  isEnabled() {
    return true;
  }

  async sendEmail(input: SendEmailInput) {
    this.messages.push(input);
  }
}

const mockGoogleVerifier: AuthIdentityVerifier = {
  isEnabled() {
    return true;
  },
  provider: "google",
  async verify() {
    return {
      email: "owner@example.com",
      emailVerified: true,
      name: "Owner",
      providerUserId: "google_owner_123",
    };
  },
};

const mockAppleVerifier: AuthIdentityVerifier = {
  isEnabled() {
    return true;
  },
  provider: "apple",
  async verify() {
    return {
      email: "owner@example.com",
      emailVerified: true,
      name: null,
      providerUserId: "apple_owner_123",
    };
  },
};

const extractVerificationToken = (emailClient: FakeEmailClient, index = 0) => {
  const text = emailClient.messages[index]?.text ?? "";
  const match = text.match(/token=([^\s]+)/);

  if (!match) {
    throw new Error("Verification token not found in email body.");
  }

  return decodeURIComponent(match[1]);
};

const base64UrlTokenRegex = /^[A-Za-z0-9_-]{43}$/;
const uuidV7Regex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const expectVerificationEmailResponse = (
  body: unknown,
  minimumRetryAfterSeconds = 1,
) => {
  expect(body).toEqual({
    success: true,
    verificationEmail: {
      requestedAt: expect.any(String),
      resendAvailableAt: expect.any(String),
      retryAfterSeconds: expect.any(Number),
    },
  });
  expect(
    (body as { verificationEmail: { retryAfterSeconds: number } }).verificationEmail
      .retryAfterSeconds,
  ).toBeGreaterThanOrEqual(minimumRetryAfterSeconds);
};

const expectPasswordResetEmailResponse = (
  body: unknown,
  minimumRetryAfterSeconds = 1,
) => {
  expect(body).toEqual({
    passwordResetEmail: {
      requestedAt: expect.any(String),
      resendAvailableAt: expect.any(String),
      retryAfterSeconds: expect.any(Number),
    },
    success: true,
  });
  expect(
    (body as { passwordResetEmail: { retryAfterSeconds: number } }).passwordResetEmail
      .retryAfterSeconds,
  ).toBeGreaterThanOrEqual(minimumRetryAfterSeconds);
};

const createAuthenticatedRequest = async (
  path: string,
  init?: RequestInit & { transport?: "bearer" | "cookie" },
) => {
  const instance = createApp();
  const user = await instance.repositories.userRepository.create({
    email: "owner@example.com",
    emailVerified: true,
    name: "Owner",
  });
  await instance.repositories.authProviderRepository.create({
    provider: "google",
    providerUserId: "google_owner_123",
    userId: user.id,
  });
  const token = await instance.sessionService.sign(user);
  const headers = new Headers(init?.headers);
  const transport = init?.transport ?? "cookie";

  if (transport === "bearer") {
    headers.set("authorization", `Bearer ${token}`);
  } else {
    headers.set("cookie", `${instance.config.sessionCookieName}=${token}`);
  }

  return {
    ...instance,
    token,
    user,
    request: new Request(`http://localhost${path}`, {
      ...init,
      headers,
    }),
  };
};

describe("App", () => {
  it("serves a health endpoint", async () => {
    const { app } = createApp();
    const response = await app.handle(new Request("http://localhost/health"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
    });
  });

  it("serves root metadata", async () => {
    const { app } = createApp();
    const response = await app.handle(new Request("http://localhost/"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      service: "bun-elysia-auth",
      status: "ok",
      version: "v1",
    });
  });

  it("serves an api index route", async () => {
    const { app } = createApp();
    const response = await app.handle(new Request("http://localhost/api"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      availableVersions: ["/api/v1"],
      status: "ok",
    });
  });

  it("returns a standardized 404 for unknown routes", async () => {
    const { app } = createApp();
    const response = await app.handle(
      new Request("http://localhost/does-not-exist"),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
      },
    });
  });

  it("allows CORS preflight for configured private origins", async () => {
    const { app } = createApp();
    const response = await app.handle(
      new Request("http://localhost/api/v1/account", {
        method: "OPTIONS",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": "GET",
          "access-control-request-headers": "content-type",
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe(
      "true",
    );
  });

  it("rejects CORS preflight for unconfigured private origins", async () => {
    const { app } = createApp();
    const response = await app.handle(
      new Request("http://localhost/api/v1/account", {
        method: "OPTIONS",
        headers: {
          origin: "http://malicious.example",
          "access-control-request-method": "GET",
        },
      }),
    );

    expect(response.status).toBe(403);
  });

  it("rejects wildcard CORS configuration for the credentialed API", () => {
    expect(() =>
      createApp({
        config: {
          ...createApp().config,
          allowedCorsOrigins: ["*"],
        },
      }),
    ).toThrow(
      "CORS_ORIGINS must list explicit origins. Wildcards are not allowed for credentialed auth APIs.",
    );
  });

  it("rejects the development session secret in production", () => {
    expect(() =>
      createApp({
        config: {
          ...createApp().config,
          envName: "production",
          isProduction: true,
          sessionSecret: "dev-session-secret-change-me-before-production",
        },
      }),
    ).toThrow(
      "SESSION_SECRET must be set to a unique value with at least 32 characters in production.",
    );
  });

  it("rejects overly large Google id tokens at validation time", async () => {
    const { app } = createApp();
    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/providers/google", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idToken: "x".repeat(8_193),
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid input.",
      },
    });
  });

  it("signs in with Google through the provider registry and sets a session cookie", async () => {
    const { app, config } = createApp({
      authProviderRegistry: new AuthProviderRegistry([mockGoogleVerifier]),
      emailClient: new FakeEmailClient(),
    });
    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/providers/google", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idToken: "test-id-token",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBe("owner@example.com");
    expect(body.user.id).toMatch(uuidV7Regex);
    expect(body.session).toEqual({
      expiresInSeconds: config.sessionTtlSeconds,
      token: expect.any(String),
      tokenType: "Bearer",
    });
    expect(response.headers.get("set-cookie")).toContain(
      `${config.sessionCookieName}=`,
    );
  });

  it("signs in with Apple through the provider registry and preserves the mobile-supplied name", async () => {
    const { app, config } = createApp({
      authProviderRegistry: new AuthProviderRegistry([mockAppleVerifier]),
      emailClient: new FakeEmailClient(),
    });
    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/providers/apple", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idToken: "test-apple-id-token",
          name: "Apple Owner",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.user.email).toBe("owner@example.com");
    expect(body.user.name).toBe("Apple Owner");
    expect(body.session).toEqual({
      expiresInSeconds: config.sessionTtlSeconds,
      token: expect.any(String),
      tokenType: "Bearer",
    });
    expect(response.headers.get("set-cookie")).toContain(
      `${config.sessionCookieName}=`,
    );
  });

  it("registers a local account, sends verification email, and blocks login until verified", async () => {
    const emailClient = new FakeEmailClient();
    const { app } = createApp({
      emailClient,
    });

    const registerResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    expect(registerResponse.status).toBe(200);
    expectVerificationEmailResponse(await registerResponse.json());
    expect(emailClient.messages).toHaveLength(1);
    expect(emailClient.messages[0]?.text).toContain(
      "https://app.example.com/verify-email?token=",
    );

    const loginResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "password123",
        }),
      }),
    );

    expect(loginResponse.status).toBe(403);
    expect(await loginResponse.json()).toEqual({
      error: {
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your email before signing in.",
      },
    });
  });

  it("requires an explicit public URL before sending auth emails", async () => {
    const emailClient = new FakeEmailClient();
    const response = await createApp({
      config: {
        ...createApp().config,
        appPublicUrl: undefined,
        frontendPublicUrl: undefined,
      },
      emailClient,
    }).app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "PUBLIC_URL_NOT_CONFIGURED",
        message:
          "APP_PUBLIC_URL or FRONTEND_PUBLIC_URL must be configured before sending auth emails.",
      },
    });
    expect(emailClient.messages).toHaveLength(0);
  });

  it("verifies email through the confirm endpoint and then allows local login", async () => {
    const emailClient = new FakeEmailClient();
    const { app, config } = createApp({
      emailClient,
    });

    await app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const token = extractVerificationToken(emailClient);
    expect(token).toMatch(base64UrlTokenRegex);
    const verifyResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token,
        }),
      }),
    );
    const verifyBody = await verifyResponse.json();

    expect(verifyResponse.status).toBe(200);
    expect(verifyBody.status).toBe("verified");
    expect(verifyBody.session).toEqual({
      expiresInSeconds: config.sessionTtlSeconds,
      token: expect.any(String),
      tokenType: "Bearer",
    });
    expect(verifyBody.user.email).toBe("owner@example.com");
    expect(verifyResponse.headers.get("set-cookie")).toContain(
      `${config.sessionCookieName}=`,
    );

    const loginResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "password123",
        }),
      }),
    );
    const loginBody = await loginResponse.json();

    expect(loginResponse.status).toBe(200);
    expect(loginBody.session).toEqual({
      expiresInSeconds: config.sessionTtlSeconds,
      token: expect.any(String),
      tokenType: "Bearer",
    });
    expect(loginBody.user.email).toBe("owner@example.com");
  });

  it("redirects backend verification links to the frontend route when configured", async () => {
    const { app } = createApp();
    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email?token=test-token"),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://app.example.com/verify-email?token=test-token",
    );
  });

  it("returns already_verified when the same verification token is submitted twice", async () => {
    const emailClient = new FakeEmailClient();
    const { app } = createApp({
      emailClient,
    });

    await app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const token = extractVerificationToken(emailClient);

    const firstResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token,
        }),
      }),
    );
    const secondResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token,
        }),
      }),
    );

    expect(firstResponse.status).toBe(200);
    expect(await secondResponse.json()).toEqual({
      status: "already_verified",
    });
    expect(secondResponse.headers.get("set-cookie")).toBeNull();
  });

  it("returns resend cooldown metadata for pending registrations", async () => {
    const emailClient = new FakeEmailClient();
    const { app } = createApp({
      emailClient,
    });

    await app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const resendResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
        }),
      }),
    );

    const resendBody = await resendResponse.json();

    expect(resendResponse.status).toBe(200);
    expectVerificationEmailResponse(resendBody);
    expect(emailClient.messages).toHaveLength(1);
  });

  it("returns an immediate generic response for already verified emails without sending mail", async () => {
    const emailClient = new FakeEmailClient();
    const { app } = createApp({
      emailClient,
    });

    await app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const token = extractVerificationToken(emailClient);

    await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token,
        }),
      }),
    );

    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      verificationEmail: {
        requestedAt: expect.any(String),
        resendAvailableAt: expect.any(String),
        retryAfterSeconds: 0,
      },
    });
    expect(emailClient.messages).toHaveLength(1);
  });

  it("returns the same resend metadata for unknown emails without leaking account existence", async () => {
    const emailClient = new FakeEmailClient();
    const { app } = createApp({
      emailClient,
    });

    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "unknown@example.com",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expectVerificationEmailResponse(await response.json());
    expect(emailClient.messages).toHaveLength(0);
  });

  it("enforces a persisted hourly resend cap per email", async () => {
    const emailClient = new FakeEmailClient();
    const { app } = createApp({
      config: {
        ...createApp().config,
        authEmailMaxPerDay: 10,
        authEmailMaxPerHour: 1,
        authEmailResendCooldownSeconds: 0,
        appPublicUrl: "https://api.example.com",
        frontendPublicUrl: "https://app.example.com",
        rateLimitAuthEmailPerMinute: 10,
      },
      emailClient,
    });

    await app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const resendResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
        }),
      }),
    );
    const resendBody = await resendResponse.json();

    expect(resendResponse.status).toBe(200);
    expectVerificationEmailResponse(resendBody, 3_500);
    expect(emailClient.messages).toHaveLength(1);
  });

  it("enforces a persisted daily resend cap per email", async () => {
    const emailClient = new FakeEmailClient();
    const { app } = createApp({
      config: {
        ...createApp().config,
        authEmailMaxPerDay: 1,
        authEmailMaxPerHour: 10,
        authEmailResendCooldownSeconds: 0,
        appPublicUrl: "https://api.example.com",
        frontendPublicUrl: "https://app.example.com",
        rateLimitAuthEmailPerMinute: 10,
      },
      emailClient,
    });

    await app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const resendResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
        }),
      }),
    );
    const resendBody = await resendResponse.json();

    expect(resendResponse.status).toBe(200);
    expectVerificationEmailResponse(resendBody, 80_000);
    expect(emailClient.messages).toHaveLength(1);
  });

  it("uses the dedicated auth-email request scope", async () => {
    const { app } = createApp({
      config: {
        ...createApp().config,
        rateLimitAuthEmailPerMinute: 1,
      },
      emailClient: new FakeEmailClient(),
    });

    const firstResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
        }),
      }),
    );

    const secondResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
        }),
      }),
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(429);
    expect(await secondResponse.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: "Rate limit exceeded.",
      },
    });
  });

  it("sends a password reset email for verified local accounts", async () => {
    const emailClient = new FakeEmailClient();
    const { app } = createApp({
      emailClient,
    });

    await app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const verificationToken = extractVerificationToken(emailClient);

    await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: verificationToken,
        }),
      }),
    );

    const resetRequestResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/password-reset/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
        }),
      }),
    );
    const resetRequestBody = await resetRequestResponse.json();

    expect(resetRequestResponse.status).toBe(200);
    expectPasswordResetEmailResponse(resetRequestBody);
    expect(emailClient.messages).toHaveLength(2);
    expect(emailClient.messages[1]?.text).toContain(
      "https://app.example.com/reset-password?token=",
    );
  });

  it("returns generic password reset metadata for unknown emails", async () => {
    const emailClient = new FakeEmailClient();
    const { app } = createApp({
      emailClient,
    });

    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/password-reset/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "unknown@example.com",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expectPasswordResetEmailResponse(await response.json());
    expect(emailClient.messages).toHaveLength(0);
  });

  it("resets the password and invalidates existing sessions", async () => {
    const emailClient = new FakeEmailClient();
    const { app, config } = createApp({
      emailClient,
    });

    await app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const verificationToken = extractVerificationToken(emailClient);
    const verificationResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token: verificationToken,
        }),
      }),
    );
    const sessionCookie = verificationResponse.headers.get("set-cookie")!;

    await app.handle(
      new Request("http://localhost/api/v1/auth/password-reset/request", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
        }),
      }),
    );

    const passwordResetToken = extractVerificationToken(emailClient, 1);
    expect(passwordResetToken).toMatch(base64UrlTokenRegex);
    const confirmResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/password-reset/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          password: "newpassword123",
          token: passwordResetToken,
        }),
      }),
    );

    expect(confirmResponse.status).toBe(200);
    expect(await confirmResponse.json()).toEqual({
      success: true,
    });

    const oldSessionResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/session", {
        headers: {
          cookie: sessionCookie,
        },
      }),
    );

    expect(await oldSessionResponse.json()).toEqual({
      authenticated: false,
      user: null,
    });

    const oldPasswordLoginResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "password123",
        }),
      }),
    );

    expect(oldPasswordLoginResponse.status).toBe(401);
    expect(await oldPasswordLoginResponse.json()).toEqual({
      error: {
        code: "INVALID_CREDENTIALS",
        message: "Invalid email or password.",
      },
    });

    const newPasswordLoginResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          password: "newpassword123",
        }),
      }),
    );
    const newPasswordLoginBody = await newPasswordLoginResponse.json();

    expect(newPasswordLoginResponse.status).toBe(200);
    expect(newPasswordLoginBody.user.email).toBe("owner@example.com");
    expect(newPasswordLoginResponse.headers.get("set-cookie")).toContain(
      `${config.sessionCookieName}=`,
    );
  }, 15_000);

  it("auto-links Google sign-in to an existing verified local account", async () => {
    const emailClient = new FakeEmailClient();
    const instance = createApp({
      authProviderRegistry: new AuthProviderRegistry([mockGoogleVerifier]),
      emailClient,
    });

    await instance.app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const token = extractVerificationToken(emailClient);

    await instance.app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token,
        }),
      }),
    );

    const localUser = await instance.repositories.userRepository.findByEmail(
      "owner@example.com",
    );
    const googleResponse = await instance.app.handle(
      new Request("http://localhost/api/v1/auth/providers/google", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idToken: "test-id-token",
        }),
      }),
    );
    const googleBody = await googleResponse.json();

    expect(googleResponse.status).toBe(200);
    expect(googleBody.user.id).toBe(localUser?.id);

    const providers = await instance.repositories.authProviderRepository.listByUserId(
      localUser!.id,
    );
    expect(providers.map((provider) => provider.provider).sort()).toEqual([
      "email",
      "google",
    ]);
  });

  it("auto-links Apple sign-in to an existing verified local account", async () => {
    const emailClient = new FakeEmailClient();
    const instance = createApp({
      authProviderRegistry: new AuthProviderRegistry([mockAppleVerifier]),
      emailClient,
    });

    await instance.app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const token = extractVerificationToken(emailClient);

    await instance.app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token,
        }),
      }),
    );

    const localUser = await instance.repositories.userRepository.findByEmail(
      "owner@example.com",
    );
    const appleResponse = await instance.app.handle(
      new Request("http://localhost/api/v1/auth/providers/apple", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          idToken: "test-apple-id-token",
          name: "Updated Apple Owner",
        }),
      }),
    );
    const appleBody = await appleResponse.json();

    expect(appleResponse.status).toBe(200);
    expect(appleBody.user.id).toBe(localUser?.id);
    expect(appleBody.user.name).toBe("Updated Apple Owner");

    const providers = await instance.repositories.authProviderRepository.listByUserId(
      localUser!.id,
    );
    expect(providers.map((provider) => provider.provider).sort()).toEqual([
      "apple",
      "email",
    ]);
  });

  it("returns an unauthenticated session without a cookie", async () => {
    const { app } = createApp({
      emailClient: new FakeEmailClient(),
    });
    const response = await app.handle(
      new Request("http://localhost/api/v1/auth/session"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      authenticated: false,
      user: null,
    });
  });

  it("returns the authenticated session with a valid cookie", async () => {
    const { app, request, user } = await createAuthenticatedRequest(
      "/api/v1/auth/session",
    );
    const response = await app.handle(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authenticated).toBe(true);
    expect(body.user.email).toBe(user.email);
    expect(body.user.id).toBe(user.id);
    expect(body.user.id).toMatch(uuidV7Regex);
    expect(typeof body.user.createdAt).toBe("string");
    expect(typeof body.user.updatedAt).toBe("string");
  });

  it("returns the authenticated session with a valid bearer token", async () => {
    const { app, request, user } = await createAuthenticatedRequest(
      "/api/v1/auth/session",
      {
        transport: "bearer",
      },
    );
    const response = await app.handle(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.authenticated).toBe(true);
    expect(body.user.email).toBe(user.email);
    expect(body.user.id).toBe(user.id);
  });

  it("clears the session cookie on logout", async () => {
    const { app, request } = await createAuthenticatedRequest("/api/v1/auth/logout", {
      method: "POST",
    });
    const response = await app.handle(request);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
    });
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });

  it("allows mobile clients to use a bearer token on protected account routes", async () => {
    const getContext = await createAuthenticatedRequest("/api/v1/account", {
      transport: "bearer",
    });
    const getResponse = await getContext.app.handle(getContext.request);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.account.email).toBe("owner@example.com");

    const patchContext = await createAuthenticatedRequest("/api/v1/account", {
      body: JSON.stringify({
        name: "Updated Owner",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
      transport: "bearer",
    });
    const patchResponse = await patchContext.app.handle(patchContext.request);
    const patchBody = await patchResponse.json();

    expect(patchResponse.status).toBe(200);
    expect(patchBody.account.name).toBe("Updated Owner");
  });

  it("rejects cross-site browser requests on cookie-sensitive endpoints", async () => {
    const { app, request } = await createAuthenticatedRequest("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        origin: "https://malicious.example",
      },
    });
    const response = await app.handle(request);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        code: "UNTRUSTED_ORIGIN",
        message: "Cross-site browser requests are not allowed for this endpoint.",
      },
    });
  });

  it("invalidates prior tokens on logout-all", async () => {
    const { app, token, request } = await createAuthenticatedRequest(
      "/api/v1/auth/logout-all",
      {
        method: "POST",
      },
    );
    const logoutResponse = await app.handle(request);

    expect(logoutResponse.status).toBe(200);

    const sessionResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/session", {
        headers: {
          cookie: `auth_session=${token}`,
        },
      }),
    );

    expect(await sessionResponse.json()).toEqual({
      authenticated: false,
      user: null,
    });
  });

  it("invalidates bearer tokens on logout-all", async () => {
    const { app, token, request } = await createAuthenticatedRequest(
      "/api/v1/auth/logout-all",
      {
        method: "POST",
        transport: "bearer",
      },
    );
    const logoutResponse = await app.handle(request);

    expect(logoutResponse.status).toBe(200);

    const sessionResponse = await app.handle(
      new Request("http://localhost/api/v1/auth/session", {
        headers: {
          authorization: `Bearer ${token}`,
        },
      }),
    );

    expect(await sessionResponse.json()).toEqual({
      authenticated: false,
      user: null,
    });
  });

  it("returns linked and available auth providers", async () => {
    const { app, request } = await createAuthenticatedRequest(
      "/api/v1/auth/providers",
    );
    const response = await app.handle(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.providers.available).toEqual([
      {
        enabled: true,
        provider: "email",
      },
      {
        enabled: false,
        provider: "google",
      },
      {
        enabled: false,
        provider: "apple",
      },
    ]);
    expect(body.providers.linked).toHaveLength(1);
    expect(body.providers.linked[0].provider).toBe("google");
  });

  it("returns and updates the authenticated account", async () => {
    const getContext = await createAuthenticatedRequest("/api/v1/account");
    const getResponse = await getContext.app.handle(getContext.request);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.account.email).toBe("owner@example.com");

    const patchContext = await createAuthenticatedRequest("/api/v1/account", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        name: "Updated Owner",
      }),
    });
    const patchResponse = await patchContext.app.handle(patchContext.request);
    const patchBody = await patchResponse.json();

    expect(patchResponse.status).toBe(200);
    expect(patchBody.account.name).toBe("Updated Owner");
  });

  it("rejects account deletion when the confirmation email does not match", async () => {
    const { app, request } = await createAuthenticatedRequest("/api/v1/account", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        confirmEmail: "someone-else@example.com",
      }),
    });
    const response = await app.handle(request);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "EMAIL_CONFIRMATION_MISMATCH",
        message: "Confirmation email does not match the current account.",
      },
    });
  });

  it("deletes the authenticated account and cascades auth state", async () => {
    const emailClient = new FakeEmailClient();
    const instance = createApp({
      emailClient,
    });

    await instance.app.handle(
      new Request("http://localhost/api/v1/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email: "owner@example.com",
          name: "Owner",
          password: "password123",
        }),
      }),
    );

    const token = extractVerificationToken(emailClient);
    const verifyResponse = await instance.app.handle(
      new Request("http://localhost/api/v1/auth/verify-email/confirm", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          token,
        }),
      }),
    );
    const cookie = verifyResponse.headers.get("set-cookie")!;
    const user = await instance.repositories.userRepository.findByEmail(
      "owner@example.com",
    );

    const response = await instance.app.handle(
      new Request("http://localhost/api/v1/account", {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          confirmEmail: "owner@example.com",
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
    });
    expect(await instance.repositories.userRepository.findById(user!.id)).toBeNull();
    expect(
      await instance.repositories.authProviderRepository.listByUserId(user!.id),
    ).toEqual([]);
    expect(
      await instance.repositories.localAuthCredentialRepository.findByUserId(user!.id),
    ).toBeNull();
  });

  it("uses the in-memory repository path when DATABASE_URL is empty", async () => {
    const instance = createApp({
      emailClient: new FakeEmailClient(),
    });

    expect(instance.database.db).toBeNull();
    expect(instance.database.sql).toBeNull();

    const user = await instance.repositories.userRepository.create({
      email: "memory@example.com",
      emailVerified: true,
      name: "Memory User",
    });

    expect(await instance.repositories.userRepository.findById(user.id)).toEqual(user);
  });
});
