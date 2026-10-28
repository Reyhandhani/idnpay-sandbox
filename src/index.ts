#!/usr/bin/env node
import { buildApp } from "./app";
import { ConfigError, loadConfig } from "./config/env";
import { describeError } from "./errors";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  const shutdown = (signal: NodeJS.Signals) => {
    app.log.info({ signal }, "Shutting down.");
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: describeError(error) }, "Failed to shut down cleanly.");
        process.exit(1);
      },
    );
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await app.listen({ host: config.host, port: config.port });
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    console.error(`Invalid configuration: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
