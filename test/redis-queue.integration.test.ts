import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import Fastify from "fastify";
import Redis from "ioredis";
import { createWebhookQueue } from "../src/queues/create-webhook-queue";
import { RedisWebhookQueue } from "../src/queues/redis-webhook-queue";
import type { ScheduledJob } from "../src/queues/webhook-queue";
import type { WebhookJob } from "../src/types";
import { defineQueueContract, LEASE_MS } from "./support/queue-contract";

/**
 * Pengujian ini membutuhkan Redis sungguhan. Jalankan dengan:
 *   TEST_REDIS_URL=redis://127.0.0.1:6379 npm test
 */
const redisUrl = process.env.TEST_REDIS_URL;
const logger = Fastify({ logger: { level: "silent" } }).log;
const skip = redisUrl ? false : "TEST_REDIS_URL belum diisi";

function uniquePrefix(label: string): string {
  return `idnpay:test:${label}:${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
}

function job(id: string, runAt: number): ScheduledJob {
  const payload: WebhookJob = {
    id,
    transaction_id: `trx-${id}`,
    callback_url: "http://merchant.test/webhook",
    body: JSON.stringify({ id }),
    signature: "sig",
    failures: 0,
  };
  return { runAt, job: payload };
}

describe("antrean Redis sungguhan", { skip }, () => {
  it("terhubung ke Redis dan memilih backend Redis", async () => {
    const queue = await createWebhookQueue(redisUrl, logger);
    assert.ok(queue instanceof RedisWebhookQueue);
    await queue.close();
  });

  it("menyimpan job di sorted set dan memindahkannya ke lease saat diklaim", async () => {
    const prefix = uniquePrefix("set");
    const client = new Redis(redisUrl!, { lazyConnect: true });
    await client.connect();
    const queue = new RedisWebhookQueue(client, prefix);

    try {
      await queue.enqueue(job("later", 5000));
      await queue.enqueue(job("now", 1000));
      assert.equal(await client.zcard(`${prefix}:delayed`), 2);

      const [claimed] = await queue.claimDue(1000, 10, LEASE_MS);
      assert.equal(claimed?.job.id, "now");
      assert.equal(await client.zcard(`${prefix}:delayed`), 1);
      assert.equal(await client.zcard(`${prefix}:leased`), 1);

      assert.ok(claimed);
      await queue.ack(claimed.lease);
      assert.equal(await client.zcard(`${prefix}:leased`), 0);
    } finally {
      await client.del(`${prefix}:delayed`, `${prefix}:leased`);
      await queue.close();
    }
  });

  it("job yang diklaim dua worker hanya diproses oleh satu worker", async () => {
    const prefix = uniquePrefix("race");
    const first = new Redis(redisUrl!, { lazyConnect: true });
    const second = new Redis(redisUrl!, { lazyConnect: true });
    await Promise.all([first.connect(), second.connect()]);
    const queueA = new RedisWebhookQueue(first, prefix);
    const queueB = new RedisWebhookQueue(second, prefix);

    try {
      for (let i = 0; i < 50; i++) {
        await queueA.enqueue(job(`race-${i}`, 0));
      }
      const [a, b] = await Promise.all([queueA.claimDue(0, 50, LEASE_MS), queueB.claimDue(0, 50, LEASE_MS)]);
      const ids = [...a, ...b].map((item) => item.job.id);
      assert.equal(ids.length, 50);
      assert.equal(new Set(ids).size, 50);
    } finally {
      await first.del(`${prefix}:delayed`, `${prefix}:leased`);
      await queueA.close();
      await queueB.close();
    }
  });

  it("job dari worker yang berhenti dipulihkan oleh worker lain setelah lease habis", async () => {
    const prefix = uniquePrefix("crash");
    const crashed = new Redis(redisUrl!, { lazyConnect: true });
    const survivor = new Redis(redisUrl!, { lazyConnect: true });
    await Promise.all([crashed.connect(), survivor.connect()]);
    const crashedQueue = new RedisWebhookQueue(crashed, prefix);
    const survivorQueue = new RedisWebhookQueue(survivor, prefix);

    try {
      await crashedQueue.enqueue(job("orphan", 1000));
      const [lost] = await crashedQueue.claimDue(1000, 10, LEASE_MS);
      assert.equal(lost?.job.id, "orphan");
      crashed.disconnect();

      assert.equal(await survivorQueue.recoverExpired(1000 + LEASE_MS - 1), 0);
      assert.equal(await survivorQueue.recoverExpired(1000 + LEASE_MS), 1);

      const [recovered] = await survivorQueue.claimDue(1000 + LEASE_MS, 10, LEASE_MS);
      assert.equal(recovered?.job.id, "orphan");
      assert.ok(recovered);
      await survivorQueue.ack(recovered.lease);
    } finally {
      await survivor.del(`${prefix}:delayed`, `${prefix}:leased`);
      await survivorQueue.close();
    }
  });
});

if (redisUrl) {
  defineRedisContract(redisUrl);
}

function defineRedisContract(url: string): void {
  const clients: Redis[] = [];
  describe("kontrak antrean Redis sungguhan", () => {
    after(async () => {
      await Promise.all(clients.map((client) => client.quit()));
    });

    defineQueueContract("redis", () => {
      const client = new Redis(url, { lazyConnect: true });
      clients.push(client);
      void client.connect();
      return new RedisWebhookQueue(client, uniquePrefix("contract"));
    });
  });
}
