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
Bun.env.GOOGLE_CLIENT_ID = "";
Bun.env.SESSION_COOKIE_NAME = "auth_template_session";
Bun.env.SESSION_ISSUER = "elysia-auth-template";
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

const extractVerificationToken = (emailClient: FakeEmailClient, index = 0) => {
  const text = emailClient.messages[index]?.text ?? "";
  const match = text.match(/token=([^\s]+)/);

  if (!match) {
    throw new Error("Verification token not found in email body.");
  }

  return decodeURIComponent(match[1]);
};

const createAuthenticatedRequest = async (
  path: string,
  init?: RequestInit,
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
  headers.set("cookie", `${instance.config.sessionCookieName}=${token}`);

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
      service: "elysia-auth-template",
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
    expect(await registerResponse.json()).toEqual({
      success: true,
    });
    expect(emailClient.messages).toHaveLength(1);

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

  it("verifies email from the emailed link and then allows local login", async () => {
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
    const verifyResponse = await app.handle(
      new Request(`http://localhost/api/v1/auth/verify-email?token=${token}`),
    );
    const verifyBody = await verifyResponse.json();

    expect(verifyResponse.status).toBe(200);
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
    expect(loginBody.user.email).toBe("owner@example.com");
  });

  it("resends verification emails for pending registrations", async () => {
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

    expect(resendResponse.status).toBe(200);
    expect(await resendResponse.json()).toEqual({
      success: true,
    });
    expect(emailClient.messages).toHaveLength(2);
  });

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
      new Request(`http://localhost/api/v1/auth/verify-email?token=${token}`),
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
    expect(typeof body.user.createdAt).toBe("string");
    expect(typeof body.user.updatedAt).toBe("string");
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
          cookie: `auth_template_session=${token}`,
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
      new Request(`http://localhost/api/v1/auth/verify-email?token=${token}`),
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
