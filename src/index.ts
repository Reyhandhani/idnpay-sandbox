#!/usr/bin/env node
import { buildApp } from "./app";
import { ConfigError, loadConfig } from "./config/env";
import { describeError } from "./errors";

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp(config);

  const shutdown = (signal: NodeJS.Signals) => {
    app.log.info({ signal }, "Menghentikan server.");
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: describeError(error) }, "Gagal menghentikan server.");
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
    console.error(`Konfigurasi tidak valid: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
