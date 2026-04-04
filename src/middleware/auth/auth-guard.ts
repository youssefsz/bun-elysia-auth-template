import type { Cookie } from "elysia";
import { AppError } from "../../utils/app-error";
import type { AuthService } from "../../services/auth-service/auth.service";

type CookieStore = Record<string, Cookie<unknown>>;

export class AuthGuard {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionCookieName: string,
  ) {}

  async require(cookie: CookieStore) {
    const token = this.readSessionToken(cookie);
    const user = await this.authService.getAuthenticatedUser(token);

    if (!user) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    return user;
  }

  async requireSession(cookie: CookieStore) {
    const token = this.readSessionToken(cookie);
    const authenticatedSession =
      await this.authService.getAuthenticatedSession(token);

    if (!authenticatedSession) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication is required.");
    }

    return authenticatedSession;
  }

  readSessionToken(cookie: CookieStore) {
    const sessionCookie = cookie[this.sessionCookieName];

    return typeof sessionCookie?.value === "string" ? sessionCookie.value : undefined;
  }
}
