import { SignJWT, jwtVerify } from "jose";
import type { AppConfig } from "../../config/env";
import { AppError } from "../../utils/app-error";
import type { User } from "../../domains/users/user.types";

export interface SessionPayload {
  email: string;
  expiresAt: Date | null;
  issuedAt: Date | null;
  sessionVersion: number;
  userId: string;
}

export class SessionService {
  private readonly audience: string;
  private readonly issuer: string;
  private readonly secret: Uint8Array;
  private readonly ttlSeconds: number;

  constructor(config: AppConfig) {
    this.audience = config.sessionIssuer;
    this.issuer = config.sessionIssuer;
    this.secret = new TextEncoder().encode(config.sessionSecret);
    this.ttlSeconds = config.sessionTtlSeconds;
  }

  async sign(user: User): Promise<string> {
    return new SignJWT({ email: user.email, sessionVersion: user.sessionVersion })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience(this.audience)
      .setExpirationTime(`${this.ttlSeconds}s`)
      .setIssuedAt()
      .setIssuer(this.issuer)
      .setSubject(user.id)
      .sign(this.secret);
  }

  async verify(token: string): Promise<SessionPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        audience: this.audience,
        issuer: this.issuer,
      });

      if (!payload.sub || typeof payload.email !== "string") {
        throw new AppError(
          401,
          "INVALID_SESSION",
          "Session token is missing required claims.",
        );
      }

      return {
        email: payload.email,
        expiresAt:
          typeof payload.exp === "number" ? new Date(payload.exp * 1000) : null,
        issuedAt:
          typeof payload.iat === "number" ? new Date(payload.iat * 1000) : null,
        sessionVersion:
          typeof payload.sessionVersion === "number" ? payload.sessionVersion : 1,
        userId: payload.sub,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      throw new AppError(401, "INVALID_SESSION", "Session token is invalid.");
    }
  }
}
