import type { Logger } from "../../utils/logger";
import { AppError } from "../../utils/app-error";

interface RateLimitRule {
  limit: number;
  windowMs: number;
}

type RateLimitScope = "account" | "auth";

interface RateLimitSet {
  headers: Record<string, string | number>;
}

interface RequestIpServer {
  requestIP(request: Request): { address: string } | null;
}

export class RequestRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  private pruneCounter = 0;

  constructor(
    private readonly rules: Record<RateLimitScope, RateLimitRule>,
    private readonly logger: Logger,
    private readonly options: {
      pruneInterval?: number;
      trustProxyHeaders?: boolean;
    } = {},
  ) {}

  enforce(
    scope: RateLimitScope,
    request: Request,
    set: RateLimitSet,
    server: RequestIpServer | null = null,
  ) {
    const rule = this.rules[scope];
    this.pruneExpiredBuckets();

    const clientIp = this.getClientIp(request, server);
    const key = `${scope}:${clientIp}`;
    const now = Date.now();
    const current = this.buckets.get(key);
    const bucket =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + rule.windowMs }
        : current;

    bucket.count += 1;
    this.buckets.set(key, bucket);

    const remaining = Math.max(rule.limit - bucket.count, 0);
    const retryAfterSeconds = Math.max(
      Math.ceil((bucket.resetAt - now) / 1000),
      1,
    );

    set.headers["x-ratelimit-limit"] = String(rule.limit);
    set.headers["x-ratelimit-remaining"] = String(remaining);
    set.headers["x-ratelimit-reset"] = String(Math.ceil(bucket.resetAt / 1000));

    if (bucket.count > rule.limit) {
      set.headers["retry-after"] = String(retryAfterSeconds);

      this.logger.warn("rate_limit.exceeded", {
        clientIp,
        scope,
      });

      throw new AppError(429, "RATE_LIMITED", "Rate limit exceeded.");
    }
  }

  private getClientIp(request: Request, server: RequestIpServer | null) {
    const directIp = server?.requestIP(request)?.address;

    if (!this.options.trustProxyHeaders) {
      return directIp ?? "anonymous";
    }

    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const cloudflareIp = request.headers.get("cf-connecting-ip");

    return (
      forwardedFor?.split(",")[0]?.trim() ??
      realIp ??
      cloudflareIp ??
      directIp ??
      "anonymous"
    );
  }

  private pruneExpiredBuckets() {
    this.pruneCounter += 1;

    if (this.pruneCounter % (this.options.pruneInterval ?? 100) !== 0) {
      return;
    }

    const now = Date.now();

    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) {
        this.buckets.delete(key);
      }
    }
  }
}
