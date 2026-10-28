import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import RedisMock from "ioredis-mock";
import { createWebhookQueue } from "../src/queues/create-webhook-queue";
import { RedisWebhookQueue } from "../src/queues/redis-webhook-queue";
import { MemoryWebhookQueue } from "../src/queues/webhook-queue";
import { defineQueueContract } from "./support/queue-contract";

const logger = Fastify({ logger: { level: "silent" } }).log;

defineQueueContract("memori", () => new MemoryWebhookQueue());
defineQueueContract("redis mock", () => new RedisWebhookQueue(new RedisMock(), `test:${Math.random()}`));

describe("createWebhookQueue", () => {
  it("memakai antrean memori saat REDIS_URL tidak diisi", async () => {
    const queue = await createWebhookQueue(undefined, logger);
    assert.ok(queue instanceof MemoryWebhookQueue);
  });

  it("kembali ke antrean memori jika Redis tidak dapat dijangkau", async () => {
    const queue = await createWebhookQueue("redis://127.0.0.1:1", logger);
    assert.ok(queue instanceof MemoryWebhookQueue);
    await queue.close();
  });
});
