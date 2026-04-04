import { describe, expect, it } from "bun:test";
import { RequestRateLimiter } from "./rate-limiter";

const rules = {
  account: { limit: 2, windowMs: 1_000 },
  authEmail: { limit: 1, windowMs: 1_000 },
  auth: { limit: 2, windowMs: 1_000 },
} as const;

const logger = {
  error() {},
  info() {},
  warn() {},
};

const createServer = (address: string) => ({
  requestIP() {
    return {
      address,
      family: "IPv4" as const,
      port: 30_000,
    };
  },
});

describe("RequestRateLimiter", () => {
  it("ignores spoofed forwarding headers by default", () => {
    const limiter = new RequestRateLimiter(rules, logger);
    const server = createServer("203.0.113.10");
    const createSet = () => ({ headers: {} as Record<string, string | number> });

    limiter.enforce(
      "account",
      new Request("http://localhost/api/v1/account", {
        headers: { "x-forwarded-for": "198.51.100.1" },
      }),
      createSet(),
      server,
    );
    limiter.enforce(
      "account",
      new Request("http://localhost/api/v1/account", {
        headers: { "x-forwarded-for": "198.51.100.2" },
      }),
      createSet(),
      server,
    );
    expect(() =>
      limiter.enforce(
        "account",
        new Request("http://localhost/api/v1/account", {
          headers: { "x-forwarded-for": "198.51.100.3" },
        }),
        createSet(),
        server,
      ),
    ).toThrow("Rate limit exceeded.");
  });

  it("can trust proxy headers when explicitly enabled", () => {
    const limiter = new RequestRateLimiter(rules, logger, {
      trustProxyHeaders: true,
    });
    const server = createServer("203.0.113.10");
    const createSet = () => ({ headers: {} as Record<string, string | number> });

    limiter.enforce(
      "auth",
      new Request("http://localhost/api/v1/auth/session", {
        headers: { "x-forwarded-for": "198.51.100.1" },
      }),
      createSet(),
      server,
    );
    limiter.enforce(
      "auth",
      new Request("http://localhost/api/v1/auth/session", {
        headers: { "x-forwarded-for": "198.51.100.2" },
      }),
      createSet(),
      server,
    );

    expect(() =>
      limiter.enforce(
        "auth",
        new Request("http://localhost/api/v1/auth/session", {
          headers: { "x-forwarded-for": "198.51.100.1" },
        }),
        createSet(),
        server,
      ),
    ).not.toThrow();

    expect(() =>
      limiter.enforce(
        "auth",
        new Request("http://localhost/api/v1/auth/session", {
          headers: { "x-forwarded-for": "198.51.100.1" },
        }),
        createSet(),
        server,
      ),
    ).toThrow("Rate limit exceeded.");
  });

  it("prunes expired buckets so they do not accumulate forever", () => {
    const originalNow = Date.now;
    let now = 0;
    Date.now = () => now;

    try {
      const limiter = new RequestRateLimiter(
        {
          account: { limit: 10, windowMs: 10 },
          authEmail: { limit: 10, windowMs: 10 },
          auth: { limit: 10, windowMs: 10 },
        },
        logger,
        { pruneInterval: 1 },
      );
      const createSet = () => ({
        headers: {} as Record<string, string | number>,
      });

      limiter.enforce(
        "account",
        new Request("http://localhost/api/v1/account"),
        createSet(),
        createServer("203.0.113.1"),
      );
      limiter.enforce(
        "auth",
        new Request("http://localhost/api/v1/auth/session"),
        createSet(),
        createServer("203.0.113.2"),
      );

      expect((limiter as any).buckets.size).toBe(2);

      now = 20;

      limiter.enforce(
        "auth",
        new Request("http://localhost/api/v1/auth/session"),
        createSet(),
        createServer("203.0.113.3"),
      );

      expect((limiter as any).buckets.size).toBe(1);
    } finally {
      Date.now = originalNow;
    }
  });
});
