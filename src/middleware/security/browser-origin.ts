import type { AppConfig } from "../../config/env";
import { AppError } from "../../utils/app-error";

const parseOrigin = (value: string | null) => {
  if (!value) {
    return null;
  }

  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const getTrustedOrigins = (config: AppConfig) => {
  const origins = new Set<string>();

  for (const value of config.allowedCorsOrigins) {
    const origin = parseOrigin(value);

    if (origin) {
      origins.add(origin);
    }
  }

  for (const value of [config.appPublicUrl, config.frontendPublicUrl]) {
    const origin = parseOrigin(value ?? null);

    if (origin) {
      origins.add(origin);
    }
  }

  return origins;
};

export const enforceTrustedBrowserOrigin = (
  request: Request,
  config: AppConfig,
) => {
  const requestOrigin =
    parseOrigin(request.headers.get("origin")) ??
    parseOrigin(request.headers.get("referer"));

  if (!requestOrigin) {
    return;
  }

  if (getTrustedOrigins(config).has(requestOrigin)) {
    return;
  }

  throw new AppError(
    403,
    "UNTRUSTED_ORIGIN",
    "Cross-site browser requests are not allowed for this endpoint.",
  );
};
