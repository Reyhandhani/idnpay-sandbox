import { Redis } from "ioredis";
import type { FastifyBaseLogger } from "fastify";
import { MemoryWebhookQueue, type WebhookQueue } from "./webhook-queue";
import { RedisWebhookQueue } from "./redis-webhook-queue";
import { describeError } from "../errors";

const REDIS_CONNECT_TIMEOUT_MS = 2000;

/**
 * Uses Redis when it is configured and reachable at startup, otherwise memory.
 */
export async function createWebhookQueue(
  redisUrl: string | undefined,
  logger: FastifyBaseLogger,
): Promise<WebhookQueue> {
  if (!redisUrl) {
    logger.info({ queue: "memory" }, "Webhook queue uses in-memory storage.");
    return new MemoryWebhookQueue();
  }

  const client = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
  });
  client.on("error", (error: Error) => {
    logger.warn({ err: error.message }, "Redis connection error.");
  });

  try {
    await withTimeout(client.connect(), REDIS_CONNECT_TIMEOUT_MS);
    logger.info({ queue: "redis" }, "Webhook queue connected to Redis.");
    return new RedisWebhookQueue(client);
  } catch (error) {
    client.disconnect();
    logger.warn({ err: describeError(error) }, "Redis is unreachable. Falling back to the in-memory queue.");
    return new MemoryWebhookQueue();
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout setelah ${timeoutMs} ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}
