export interface Logger {
  error(event: string, context: Record<string, unknown>): void;
  info(event: string, context: Record<string, unknown>): void;
  warn(event: string, context: Record<string, unknown>): void;
}

const ANSI = {
  blue: "\u001b[34m",
  cyan: "\u001b[36m",
  dim: "\u001b[2m",
  green: "\u001b[32m",
  red: "\u001b[31m",
  reset: "\u001b[0m",
  yellow: "\u001b[33m",
};

const serializeError = (value: unknown) => {
  if (value instanceof Error) {
    return {
      message: value.message,
      name: value.name,
      stack: value.stack,
    };
  }

  return value;
};

const formatTime = () =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date());

const stringifyValue = (value: unknown) => {
  const serialized = serializeError(value);

  if (typeof serialized === "string") {
    return serialized.includes(" ") ? JSON.stringify(serialized) : serialized;
  }

  if (
    typeof serialized === "number" ||
    typeof serialized === "boolean" ||
    serialized === null
  ) {
    return String(serialized);
  }

  return JSON.stringify(serialized);
};

const formatContext = (context: Record<string, unknown>, skipKeys: string[] = []) =>
  Object.entries(context)
    .filter(([key, value]) => value !== undefined && !skipKeys.includes(key))
    .map(([key, value]) => `${key}=${stringifyValue(value)}`)
    .join(" ");

const statusColor = (status: number) => {
  if (status >= 500) {
    return ANSI.red;
  }

  if (status >= 400) {
    return ANSI.yellow;
  }

  if (status >= 300) {
    return ANSI.cyan;
  }

  return ANSI.green;
};

const levelColor = (level: "ERROR" | "INFO" | "WARN") => {
  switch (level) {
    case "ERROR":
      return ANSI.red;
    case "WARN":
      return ANSI.yellow;
    default:
      return ANSI.blue;
  }
};

const writePrettyLog = (
  level: "ERROR" | "INFO" | "WARN",
  event: string,
  context: Record<string, unknown>,
) => {
  const time = `${ANSI.dim}${formatTime()}${ANSI.reset}`;
  const levelLabel = `${levelColor(level)}${level.padEnd(5, " ")}${ANSI.reset}`;

  if (
    (event === "request.completed" || event === "request.failed") &&
    typeof context.method === "string" &&
    typeof context.path === "string" &&
    typeof context.status === "number"
  ) {
    const tail = formatContext(context, ["durationMs", "method", "path", "status"]);
    const duration =
      typeof context.durationMs === "number" ? ` ${context.durationMs}ms` : "";
    const extras = tail ? ` ${ANSI.dim}${tail}${ANSI.reset}` : "";

    console.log(
      `${time} ${levelLabel} ${context.method} ${context.path} ${statusColor(
        context.status,
      )}${context.status}${ANSI.reset}${duration}${extras}`,
    );

    return;
  }

  const tail = formatContext(context);
  const extras = tail ? ` ${ANSI.dim}${tail}${ANSI.reset}` : "";

  console.log(`${time} ${levelLabel} ${event}${extras}`);
};

const writeLog = (
  level: "ERROR" | "INFO" | "WARN",
  env: string,
  event: string,
  context: Record<string, unknown>,
) => {
  if (env !== "production") {
    writePrettyLog(level, event, context);

    return;
  }

  console.log(
    JSON.stringify({
      context: Object.fromEntries(
        Object.entries(context).map(([key, value]) => [key, serializeError(value)]),
      ),
      env,
      event,
      level,
      timestamp: new Date().toISOString(),
    }),
  );
};

export const createLogger = (env: string): Logger => ({
  error(event, context) {
    writeLog("ERROR", env, event, context);
  },
  info(event, context) {
    writeLog("INFO", env, event, context);
  },
  warn(event, context) {
    writeLog("WARN", env, event, context);
  },
});
