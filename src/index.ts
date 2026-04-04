import { createApp } from "./app";

const { app, config, logger } = createApp();

app.listen({
  maxRequestBodySize: config.maxRequestBodySizeBytes,
  port: config.port,
});

logger.info("server.started", {
  env: config.envName,
  host: app.server?.hostname ?? "0.0.0.0",
  port: app.server?.port ?? config.port,
});
