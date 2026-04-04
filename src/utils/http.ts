import { AppError } from "./app-error";

interface ValidationLikeError {
  all?: unknown;
  message?: string;
}

export const requestPath = (request: Request) => new URL(request.url).pathname;

const normalizeForwardedValue = (value: string | null) =>
  value?.split(",")[0]?.trim() || null;

const stripOptionalQuotes = (value: string) => value.replace(/^"|"$/g, "");

const parseForwardedHeader = (value: string | null) => {
  const entry = normalizeForwardedValue(value);

  if (!entry) {
    return {
      host: null,
      proto: null,
    };
  }

  let host: string | null = null;
  let proto: string | null = null;

  for (const part of entry.split(";")) {
    const [rawKey, ...rawValueParts] = part.trim().split("=");

    if (!rawKey || rawValueParts.length === 0) {
      continue;
    }

    const key = rawKey.trim().toLowerCase();
    const rawValue = stripOptionalQuotes(rawValueParts.join("=").trim());

    if (!rawValue) {
      continue;
    }

    if (key === "host") {
      host = rawValue;
    }

    if (key === "proto") {
      proto = rawValue.toLowerCase().replace(/:$/, "");
    }
  }

  return {
    host,
    proto,
  };
};

export const buildPublicBaseUrl = (
  request: Request,
  options: {
    isProduction: boolean;
    trustProxyHeaders: boolean;
  },
) => {
  const url = new URL(request.url);
  const forwarded = options.trustProxyHeaders
    ? parseForwardedHeader(request.headers.get("forwarded"))
    : { host: null, proto: null };
  const forwardedHost = options.trustProxyHeaders
    ? normalizeForwardedValue(request.headers.get("x-forwarded-host"))
    : null;
  const forwardedProto = options.trustProxyHeaders
    ? normalizeForwardedValue(request.headers.get("x-forwarded-proto"))
        ?.toLowerCase()
        .replace(/:$/, "") || null
    : null;
  const host = forwarded.host ?? forwardedHost ?? request.headers.get("host") ?? url.host;
  const protocol = options.isProduction
    ? "https"
    : forwarded.proto ?? forwardedProto ?? url.protocol.replace(/:$/, "");

  return `${protocol}://${host}`;
};

export const mapToAppError = (code: string | number, error: unknown) => {
  if (error instanceof AppError) {
    return error;
  }

  if (code === "NOT_FOUND") {
    return new AppError(404, "NOT_FOUND", "Route not found.");
  }

  if (code === "VALIDATION") {
    const validationError = error as ValidationLikeError;

    return new AppError(400, "INVALID_REQUEST", "Invalid input.", {
      issues: validationError.all ?? validationError.message,
    });
  }

  return new AppError(500, "INTERNAL_SERVER_ERROR", "Internal server error.");
};

export const createErrorResponse = (error: AppError) => ({
  error: {
    code: error.code,
    message: error.message,
  },
});
