import type { Cookie } from "elysia";
import { AppError } from "../../utils/app-error";
import type { AuthService } from "../../services/auth-service/auth.service";

type CookieStore = Record<string, Cookie<unknown>>;
type SessionContext = {
  cookie: CookieStore;
  headers?: Headers;
};

const readBearerToken = (headers?: Headers) => {
  const authorization = headers?.get("authorization");

  if (!authorization) {
    return undefined;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  return token ? token : undefined;
};

export class AuthGuard {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookieName: string,
  ) {}

  async require(context: SessionContext) {
    const token = this.readSessionToken(context);
    const user = await this.authService.getAuthenticatedUser(token);

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    return user;
  }

  async requireSession(context: SessionContext) {
    const token = this.readSessionToken(context);
    const authenticatedSession =
      await this.authService.getAuthenticatedSession(token);

    if (!authenticatedSession) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    return authenticatedSession;
  }

  readSessionToken({ cookie, headers }: SessionContext) {
    const bearerToken = readBearerToken(headers);

    if (bearerToken) {
      return bearerToken;
    }

    const sessionCookie = cookie[this.sessionCookieName];

    return typeof sessionCookie?.value === "string" ? sessionCookie.value : undefined;
  }
}
