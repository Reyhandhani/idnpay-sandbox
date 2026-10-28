import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import type { AppConfig } from "./config/env";
import { registerErrorHandling } from "./plugins/error-handler";
import { createWebhookQueue } from "./queues/create-webhook-queue";
import type { WebhookQueue } from "./queues/webhook-queue";
import { WebhookWorker } from "./queues/webhook-worker";
import { registerRoutes } from "./routes";
import { PaymentService } from "./services/payment-service";
import { TransactionStore } from "./services/transaction-store";
import { describeError } from "./errors";

/** How often to sweep for PENDING transactions past their expiry time. */
const EXPIRY_SWEEP_MS = 1000;

export interface BuildAppOptions {
  /** Queue supplied by tests. When omitted, the backend is chosen from config. */
  readonly queue?: WebhookQueue;
  readonly clock?: () => number;
  /** Start the webhook worker and the expiry sweeper once the server is ready. */
  readonly startBackground?: boolean;
  readonly fetchImpl?: typeof fetch;
}

export async function buildApp(config: AppConfig, options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: config.logLevel },
    ajv: { customOptions: { removeAdditional: false, allErrors: true } },
  });

  if (config.usingDefaultKeys) {
    app.log.warn(
      "CLIENT_KEY or SECRET_KEY still uses the default value. Change them before sharing this instance.",
    );
  }

  const queue = options.queue ?? (await createWebhookQueue(config.redisUrl, app.log));
  const payments = new PaymentService({
    store: new TransactionStore({ maxSize: config.transactionStoreLimit }),
    queue,
    logger: app.log,
    secretKey: config.secretKey,
    merchantName: config.merchantName,
    merchantCity: config.merchantCity,
    chargeExpiryMinutes: config.chargeExpiryMinutes,
    clock: options.clock,
  });
  const worker = new WebhookWorker({
    queue,
    logger: app.log,
    retryLimit: config.webhook.retryLimit,
    timeoutMs: config.webhook.timeoutMs,
    tickMs: config.webhook.tickMs,
    clock: options.clock,
    fetchImpl: options.fetchImpl,
  });

  registerErrorHandling(app);

  if (config.dashboardEnabled) {
    const publicDir = path.join(findPackageRoot(__dirname), "public");
    if (existsSync(publicDir)) {
      await app.register(fastifyStatic, { root: publicDir, prefix: "/" });
    }
  }

  await registerRoutes(app, { config, payments });

  let expiryTimer: NodeJS.Timeout | undefined;
  let sweeping = false;

  const startBackground = options.startBackground ?? true;

  app.addHook("onReady", async () => {
    if (!startBackground) {
      return;
    }
    worker.start();
    expiryTimer = setInterval(() => {
      if (sweeping) {
        return;
      }
      sweeping = true;
      payments
        .expireDueTransactions()
        .catch((error: unknown) => {
          app.log.error({ err: describeError(error) }, "Failed to expire overdue transactions.");
        })
        .finally(() => {
          sweeping = false;
        });
    }, EXPIRY_SWEEP_MS);
  });

  app.addHook("onClose", async () => {
    if (expiryTimer) {
      clearInterval(expiryTimer);
    }
    await worker.stop();
    await queue.close();
  });

  return app;
}

/** Walks up to the nearest package.json so it works from both src/ and dist/. */
function findPackageRoot(startDir: string): string {
  let current = startDir;
  while (!existsSync(path.join(current, "package.json"))) {
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
  return current;
}
