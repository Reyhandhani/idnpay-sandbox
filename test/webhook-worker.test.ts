import assert from "node:assert/strict";
import { describe, it } from "node:test";
import Fastify from "fastify";
import { MemoryWebhookQueue, type WebhookQueue } from "../src/queues/webhook-queue";
import { WebhookWorker } from "../src/queues/webhook-worker";
import type { WebhookJob } from "../src/types";
import { manualClock } from "./helpers";

const logger = Fastify({ logger: { level: "silent" } }).log;
const TIMEOUT_MS = 1000;
const LEASE_MS = TIMEOUT_MS + 5000;

function sampleJob(overrides: Partial<WebhookJob> = {}): WebhookJob {
  return {
    id: "job-1",
    transaction_id: "trx-1",
    callback_url: "http://merchant.test/webhook",
    body: JSON.stringify({ transaction_id: "trx-1" }),
    signature: "signature",
    failures: 0,
    ...overrides,
  };
}

function scriptedFetch(responses: Array<number | Error>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift() ?? 200;
    if (next instanceof Error) {
      throw next;
    }
    return new Response(null, { status: next });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

class FlakyEnqueueQueue extends MemoryWebhookQueue {
  enqueueFails = false;

  override async enqueue(item: Parameters<MemoryWebhookQueue["enqueue"]>[0]): Promise<void> {
    if (this.enqueueFails) {
      throw new Error("Redis tidak tersedia");
    }
    await super.enqueue(item);
  }
}

function createWorker(queue: WebhookQueue, clock: () => number, fetchImpl: typeof fetch, retryLimit = 5) {
  return new WebhookWorker({
    queue,
    logger,
    retryLimit,
    timeoutMs: TIMEOUT_MS,
    tickMs: 10,
    clock,
    fetchImpl,
  });
}

describe("WebhookWorker", () => {
  it("mengirim webhook dengan header signature dan timestamp, lalu meng-ack job yang berhasil", async () => {
    const clock = manualClock();
    const queue = new MemoryWebhookQueue();
    const { fetchImpl, calls } = scriptedFetch([200]);
    await queue.enqueue({ runAt: clock.now(), job: sampleJob() });

    await createWorker(queue, clock.now, fetchImpl).tick();

    assert.equal(calls.length, 1);
    const headers = calls[0]!.init.headers as Record<string, string>;
    assert.equal(headers["x-idnpay-signature"], "signature");
    assert.equal(headers["x-idnpay-timestamp"], String(Math.floor(clock.now() / 1000)));
    assert.equal(calls[0]!.init.method, "POST");

    clock.advance(LEASE_MS * 10);
    assert.equal(await queue.recoverExpired(clock.now()), 0);
    assert.deepEqual(await queue.claimDue(clock.now(), 10, LEASE_MS), []);
  });

  it("menjadwalkan ulang dengan backoff 2^n × 1000 ms setelah respons non-2xx", async () => {
    const clock = manualClock();
    const queue = new MemoryWebhookQueue();
    const { fetchImpl } = scriptedFetch([500]);
    await queue.enqueue({ runAt: clock.now(), job: sampleJob() });

    await createWorker(queue, clock.now, fetchImpl).tick();

    assert.deepEqual(await queue.claimDue(clock.now() + 1999, 10, LEASE_MS), []);
    const [retry] = await queue.claimDue(clock.now() + 2000, 10, LEASE_MS);
    assert.equal(retry?.job.failures, 1);
  });

  it("memperpanjang jeda pada setiap kegagalan berturut-turut", async () => {
    const clock = manualClock();
    const queue = new MemoryWebhookQueue();
    const { fetchImpl } = scriptedFetch([500, 500]);
    const worker = createWorker(queue, clock.now, fetchImpl);
    await queue.enqueue({ runAt: clock.now(), job: sampleJob() });

    await worker.tick();
    clock.advance(2000);
    const [first] = await queue.claimDue(clock.now(), 10, LEASE_MS);
    assert.ok(first);
    assert.equal(first.job.failures, 1);
    await queue.enqueue({ runAt: clock.now(), job: first.job });
    await queue.ack(first.lease);

    await worker.tick();
    assert.deepEqual(await queue.claimDue(clock.now() + 3999, 10, LEASE_MS), []);
    const [second] = await queue.claimDue(clock.now() + 4000, 10, LEASE_MS);
    assert.equal(second?.job.failures, 2);
  });

  it("berhenti setelah batas percobaan tercapai dan meng-ack job tersebut", async () => {
    const clock = manualClock();
    const queue = new MemoryWebhookQueue();
    const { fetchImpl, calls } = scriptedFetch([500]);
    await queue.enqueue({ runAt: clock.now(), job: sampleJob({ failures: 2 }) });

    await createWorker(queue, clock.now, fetchImpl, 2).tick();

    assert.equal(calls.length, 1);
    clock.advance(LEASE_MS * 10);
    assert.equal(await queue.recoverExpired(clock.now()), 0);
    assert.deepEqual(await queue.claimDue(clock.now() + 3_600_000, 10, LEASE_MS), []);
  });

  it("memperlakukan kegagalan jaringan sama seperti respons non-2xx", async () => {
    const clock = manualClock();
    const queue = new MemoryWebhookQueue();
    const { fetchImpl } = scriptedFetch([new Error("ECONNREFUSED")]);
    await queue.enqueue({ runAt: clock.now(), job: sampleJob() });

    await createWorker(queue, clock.now, fetchImpl).tick();

    const [retry] = await queue.claimDue(clock.now() + 2000, 10, LEASE_MS);
    assert.equal(retry?.job.failures, 1);
  });

  it("tidak meng-ack job jika penjadwalan ulang gagal, sehingga job dipulihkan setelah lease", async () => {
    const clock = manualClock();
    const queue = new FlakyEnqueueQueue();
    const { fetchImpl } = scriptedFetch([500]);
    await queue.enqueue({ runAt: clock.now(), job: sampleJob() });
    queue.enqueueFails = true;

    await createWorker(queue, clock.now, fetchImpl).tick();

    clock.advance(LEASE_MS);
    assert.equal(await queue.recoverExpired(clock.now()), 1);
  });

  it("menjalankan job yang sudah jatuh tempo saja", async () => {
    const clock = manualClock();
    const queue = new MemoryWebhookQueue();
    const { fetchImpl, calls } = scriptedFetch([200]);
    await queue.enqueue({ runAt: clock.now() + 60_000, job: sampleJob({ id: "later" }) });

    await createWorker(queue, clock.now, fetchImpl).tick();

    assert.equal(calls.length, 0);
  });
});
