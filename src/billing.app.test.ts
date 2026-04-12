import { describe, expect, it } from "bun:test";
import {
  Environment,
  Status,
  Type,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
  type StatusResponse,
} from "@apple/app-store-server-library";
import { createApp } from "./app";
import type { AppleBillingGateway } from "./core/billing/apple/apple-app-store-gateway";
import type { GenieGateway } from "./core/ai/openrouter-genie-gateway";
import type { GenieTurnResponse } from "./schemas/genie.schemas";

Bun.env.DATABASE_URL = "";
Bun.env.CORS_ORIGINS = "http://localhost:5173";
Bun.env.GOOGLE_CLIENT_IDS = "";
Bun.env.APPLE_CLIENT_IDS = "";
Bun.env.APP_PUBLIC_URL = "https://api.example.com";
Bun.env.FRONTEND_PUBLIC_URL = "https://app.example.com";
Bun.env.SESSION_COOKIE_NAME = "tricky_genie_session";
Bun.env.SESSION_ISSUER = "tricky-genie";
Bun.env.RESEND_API_KEY = "";
Bun.env.RESEND_FROM_EMAIL = "";
Bun.env.RESEND_FROM_NAME = "";
Bun.env.APPLE_SUBSCRIPTION_PRODUCTS = JSON.stringify([
  {
    featureKeys: ["genie.chat"],
    planKey: "genie_premium",
    productId: "genie.premium.monthly",
  },
]);

class FakeAppleBillingGateway implements AppleBillingGateway {
  notifications = new Map<string, ResponseBodyV2DecodedPayload>();
  renewalInfos = new Map<string, JWSRenewalInfoDecodedPayload>();
  setAppAccountTokenCalls: Array<{
    appAccountToken: string;
    environment: "production" | "sandbox";
    originalTransactionId: string;
  }> = [];
  statusResponses = new Map<string, StatusResponse>();
  transactions = new Map<string, JWSTransactionDecodedPayload>();

  isEnabled() {
    return true;
  }

  async getAllSubscriptionStatuses(input: {
    environment: "production" | "sandbox";
    transactionId: string;
  }) {
    const key = `${input.environment}:${input.transactionId}`;
    const response = this.statusResponses.get(key);

    if (!response) {
      throw new Error(`Missing fake status response for ${key}`);
    }

    return response;
  }

  async setAppAccountToken(input: {
    appAccountToken: string;
    environment: "production" | "sandbox";
    originalTransactionId: string;
  }) {
    this.setAppAccountTokenCalls.push(input);
  }

  async verifyNotification(signedPayload: string) {
    const notification = this.notifications.get(signedPayload);

    if (!notification) {
      throw new Error(`Missing fake notification for ${signedPayload}`);
    }

    return notification;
  }

  async verifySignedRenewalInfo(signedRenewalInfo: string) {
    const renewal = this.renewalInfos.get(signedRenewalInfo);

    if (!renewal) {
      throw new Error(`Missing fake renewal info for ${signedRenewalInfo}`);
    }

    return renewal;
  }

  async verifySignedTransaction(signedTransactionInfo: string) {
    const transaction = this.transactions.get(signedTransactionInfo);

    if (!transaction) {
      throw new Error(`Missing fake transaction for ${signedTransactionInfo}`);
    }

    return transaction;
  }
}

class FakeGenieGateway implements GenieGateway {
  calls: Array<Record<string, unknown>> = [];
  nextError?: unknown;
  nextResponse?: GenieTurnResponse;

  async createTurn(input: any): Promise<GenieTurnResponse> {
    this.calls.push(input);

    if (this.nextError) {
      throw this.nextError;
    }

    if (this.nextResponse) {
      return this.nextResponse;
    }

    return input.schemaName === "genie_wish_response"
      ? {
          consequence: "The wish backfires in a technically valid way.",
          consumesWish: true,
          kind: "wish",
          playerCanContinue: true,
          pose: "laughing",
          result: "continue",
          speech: "You asked carefully, but not carefully enough.",
          summary: "The genie spots a loophole.",
        }
      : {
          consequence: "No wish was counted.",
          consumesWish: false,
          kind: "chat",
          playerCanContinue: true,
          pose: "idle",
          result: "continue",
          speech: "Ask your question, mortal.",
          summary: "The genie keeps talking.",
        };
  }
}

const buildTransaction = (
  overrides: Partial<JWSTransactionDecodedPayload> = {},
): JWSTransactionDecodedPayload => ({
  appAccountToken: overrides.appAccountToken,
  environment: overrides.environment ?? Environment.SANDBOX,
  expiresDate:
    overrides.expiresDate ?? new Date("2026-06-01T00:00:00.000Z").getTime(),
  originalPurchaseDate:
    overrides.originalPurchaseDate ??
    new Date("2026-05-01T00:00:00.000Z").getTime(),
  originalTransactionId: overrides.originalTransactionId ?? "orig_txn_1",
  productId: overrides.productId ?? "genie.premium.monthly",
  purchaseDate:
    overrides.purchaseDate ?? new Date("2026-05-01T00:00:00.000Z").getTime(),
  signedDate:
    overrides.signedDate ?? new Date("2026-05-01T00:00:00.000Z").getTime(),
  transactionId: overrides.transactionId ?? "txn_1",
  type: overrides.type ?? Type.AUTO_RENEWABLE_SUBSCRIPTION,
});

const buildStatusResponse = (
  status: Status,
  signedTransactionInfo: string,
  signedRenewalInfo?: string,
): StatusResponse => ({
  bundleId: "tn.youssef.genie",
  data: [
    {
      lastTransactions: [
        {
          originalTransactionId: "orig_txn_1",
          signedRenewalInfo,
          signedTransactionInfo,
          status,
        },
      ],
      subscriptionGroupIdentifier: "group_1",
    },
  ],
  environment: Environment.SANDBOX,
});

const createUserSession = async (
  instance: ReturnType<typeof createApp>,
  email: string,
) => {
  const user = await instance.repositories.userRepository.create({
    email,
    emailVerified: true,
    name: email.split("@")[0] || "User",
  });
  const token = await instance.sessionService.sign(user);

  return {
    token,
    user,
  };
};

const buildGenieRequestBody = (overrides: Partial<Record<string, unknown>> = {}) => ({
  conversationId: "conversation-1",
  history: [],
  inputText: "Hello Genie",
  remainingWishes: 3,
  ...overrides,
});

const grantGenieEntitlement = async (
  instance: ReturnType<typeof createApp>,
  userId: string,
) => {
  await instance.repositories.userEntitlementRepository.upsert({
    expiresAt: new Date("2026-06-01T00:00:00.000Z"),
    featureKey: "genie.chat",
    lastVerifiedAt: new Date("2026-05-01T00:00:00.000Z"),
    planKey: "genie_premium",
    productId: "genie.premium.monthly",
    source: "apple",
    sourceEnvironment: "sandbox",
    sourceOriginalTransactionId: "orig_txn_1",
    status: "active",
    userId,
  });
};

describe("Billing integration", () => {
  it("syncs a valid Apple subscription and unlocks the genie endpoint", async () => {
    const gateway = new FakeAppleBillingGateway();
    const genieGateway = new FakeGenieGateway();
    const app = createApp({
      appleBillingGateway: gateway,
      genieGateway,
    });
    const session = await createUserSession(app, "owner@example.com");
    gateway.transactions.set("signed_txn_active", buildTransaction());
    gateway.statusResponses.set(
      "sandbox:orig_txn_1",
      buildStatusResponse(Status.ACTIVE, "signed_txn_active"),
    );

    const syncResponse = await app.app.handle(
      new Request("http://localhost/api/v1/billing/apple/subscriptions/sync", {
        body: JSON.stringify({
          signedTransactionInfo: "signed_txn_active",
        }),
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(syncResponse.status).toBe(200);
    expect(gateway.setAppAccountTokenCalls.length).toBe(1);

    const chatResponse = await app.app.handle(
      new Request("http://localhost/api/v1/genie/chat", {
        body: JSON.stringify(buildGenieRequestBody()),
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(chatResponse.status).toBe(200);
    await expect(chatResponse.json()).resolves.toMatchObject({
      consumesWish: false,
      kind: "chat",
      pose: "idle",
      result: "continue",
    });
    expect(genieGateway.calls).toHaveLength(1);
  });

  it("rejects genie access for authenticated users without an active entitlement", async () => {
    const gateway = new FakeAppleBillingGateway();
    const genieGateway = new FakeGenieGateway();
    const app = createApp({
      appleBillingGateway: gateway,
      genieGateway,
    });
    const session = await createUserSession(app, "owner@example.com");
    const response = await app.app.handle(
      new Request("http://localhost/api/v1/genie/chat", {
        body: JSON.stringify(
          buildGenieRequestBody({
            inputText: "Hello",
          }),
        ),
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "PREMIUM_ACCESS_REQUIRED",
        message: "An active subscription is required to access this feature.",
      },
    });
  });

  it("rejects unauthenticated genie access", async () => {
    const gateway = new FakeAppleBillingGateway();
    const genieGateway = new FakeGenieGateway();
    const instance = createApp({
      appleBillingGateway: gateway,
      genieGateway,
    });
    const response = await instance.app.handle(
      new Request("http://localhost/api/v1/genie/chat", {
        body: JSON.stringify(
          buildGenieRequestBody({
            inputText: "Hello",
          }),
        ),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });

  it("handles Apple notifications idempotently", async () => {
    const gateway = new FakeAppleBillingGateway();
    gateway.notifications.set("signed_notification", {
      data: {
        environment: Environment.SANDBOX,
        signedTransactionInfo: "signed_txn_active",
      },
      notificationType: "DID_RENEW",
      notificationUUID: "notif_1",
      signedDate: new Date("2026-05-01T00:00:00.000Z").getTime(),
      subtype: null as any,
    });
    gateway.transactions.set("signed_txn_active", buildTransaction());
    gateway.statusResponses.set(
      "sandbox:orig_txn_1",
      buildStatusResponse(Status.ACTIVE, "signed_txn_active"),
    );

    const app = createApp({
      appleBillingGateway: gateway,
    });
    const request = new Request(
      "http://localhost/api/v1/billing/apple/notifications",
      {
        body: JSON.stringify({
          signedPayload: "signed_notification",
        }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    );

    const first = await app.app.handle(request.clone());
    const second = await app.app.handle(request.clone());

    await expect(first.json()).resolves.toMatchObject({
      accepted: true,
      duplicate: false,
    });
    await expect(second.json()).resolves.toMatchObject({
      accepted: true,
      duplicate: true,
    });
  });

  it("rejects revoked subscriptions from premium access", async () => {
    const gateway = new FakeAppleBillingGateway();
    const genieGateway = new FakeGenieGateway();
    const app = createApp({
      appleBillingGateway: gateway,
      genieGateway,
    });
    const session = await createUserSession(app, "owner@example.com");
    gateway.transactions.set(
      "signed_txn_revoked",
      buildTransaction({
        revocationDate: new Date("2026-05-02T00:00:00.000Z").getTime(),
        transactionId: "txn_revoked",
      }),
    );
    gateway.statusResponses.set(
      "sandbox:orig_txn_1",
      buildStatusResponse(Status.REVOKED, "signed_txn_revoked"),
    );

    const syncResponse = await app.app.handle(
      new Request("http://localhost/api/v1/billing/apple/subscriptions/sync", {
        body: JSON.stringify({
          signedTransactionInfo: "signed_txn_revoked",
        }),
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(syncResponse.status).toBe(200);

    const denied = await app.app.handle(
      new Request("http://localhost/api/v1/genie/chat", {
        body: JSON.stringify(
          buildGenieRequestBody({
            inputText: "Can I get in?",
          }),
        ),
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(denied.status).toBe(403);
  });

  it("validates the new genie turn payload", async () => {
    const gateway = new FakeAppleBillingGateway();
    const genieGateway = new FakeGenieGateway();
    const app = createApp({
      appleBillingGateway: gateway,
      genieGateway,
    });
    const session = await createUserSession(app, "owner@example.com");
    await grantGenieEntitlement(app, session.user.id);

    const response = await app.app.handle(
      new Request("http://localhost/api/v1/genie/chat", {
        body: JSON.stringify({
          conversationId: "",
          history: [],
          inputText: "",
          remainingWishes: 99,
        }),
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid input.",
      },
    });
  });

  it("returns a wish-shaped genie turn for explicit wishes", async () => {
    const gateway = new FakeAppleBillingGateway();
    const genieGateway = new FakeGenieGateway();
    const app = createApp({
      appleBillingGateway: gateway,
      genieGateway,
    });
    const session = await createUserSession(app, "owner@example.com");
    await grantGenieEntitlement(app, session.user.id);

    const response = await app.app.handle(
      new Request("http://localhost/api/v1/genie/chat", {
        body: JSON.stringify(
          buildGenieRequestBody({
            inputText: "I wish for endless money.",
          }),
        ),
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      consumesWish: true,
      kind: "wish",
      result: "continue",
    });
  });

  it("translates upstream genie failures into a stable backend error", async () => {
    const gateway = new FakeAppleBillingGateway();
    const genieGateway = new FakeGenieGateway();
    genieGateway.nextError = new Error("socket hang up");
    const app = createApp({
      appleBillingGateway: gateway,
      genieGateway,
    });
    const session = await createUserSession(app, "owner@example.com");
    await grantGenieEntitlement(app, session.user.id);

    const response = await app.app.handle(
      new Request("http://localhost/api/v1/genie/chat", {
        body: JSON.stringify(buildGenieRequestBody()),
        headers: {
          authorization: `Bearer ${session.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "GENIE_UPSTREAM_ERROR",
        message: "The genie could not answer right now.",
      },
    });
  });

  it("rejects a purchase that is already linked to another user", async () => {
    const gateway = new FakeAppleBillingGateway();
    const genieGateway = new FakeGenieGateway();
    const app = createApp({
      appleBillingGateway: gateway,
      genieGateway,
    });
    const firstSession = await createUserSession(app, "owner@example.com");
    const secondSession = await createUserSession(app, "second@example.com");
    gateway.transactions.set("signed_txn_active", buildTransaction());
    gateway.statusResponses.set(
      "sandbox:orig_txn_1",
      buildStatusResponse(Status.ACTIVE, "signed_txn_active"),
    );

    await app.app.handle(
      new Request("http://localhost/api/v1/billing/apple/subscriptions/sync", {
        body: JSON.stringify({
          signedTransactionInfo: "signed_txn_active",
        }),
        headers: {
          authorization: `Bearer ${firstSession.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );
    const response = await app.app.handle(
      new Request("http://localhost/api/v1/billing/apple/subscriptions/sync", {
        body: JSON.stringify({
          signedTransactionInfo: "signed_txn_active",
        }),
        headers: {
          authorization: `Bearer ${secondSession.token}`,
          "content-type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "APPLE_TRANSACTION_USER_MISMATCH",
        message: "This Apple subscription is already linked to another account.",
      },
    });
  });
});
