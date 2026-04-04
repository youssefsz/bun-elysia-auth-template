import type { Cookie } from "elysia";
import type { AppConfig } from "../../config/env";

type CookieStore = Record<string, Cookie<unknown>>;

export const clearSessionCookie = (
  cookie: CookieStore,
  config: AppConfig,
) => {
  const sessionCookie = cookie[config.sessionCookieName];
  sessionCookie.expires = new Date(0);
  sessionCookie.httpOnly = true;
  sessionCookie.maxAge = 0;
  sessionCookie.path = "/";
  sessionCookie.sameSite = config.sessionCookieSameSite;
  sessionCookie.secure = config.isProduction;
  sessionCookie.value = "";
};

export const setSessionCookie = (
  cookie: CookieStore,
  config: AppConfig,
  token: string,
) => {
  const sessionCookie = cookie[config.sessionCookieName];
  sessionCookie.httpOnly = true;
  sessionCookie.maxAge = config.sessionTtlSeconds;
  sessionCookie.path = "/";
  sessionCookie.sameSite = config.sessionCookieSameSite;
  sessionCookie.secure = config.isProduction;
  sessionCookie.value = token;
};
