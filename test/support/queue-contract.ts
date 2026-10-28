import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ScheduledJob, WebhookQueue } from "../../src/queues/webhook-queue";
import type { WebhookJob } from "../../src/types";

export const LEASE_MS = 1000;

function scheduled(id: string, runAt: number): ScheduledJob {
  const job: WebhookJob = {
    id,
    transaction_id: `trx-${id}`,
    callback_url: "http://merchant.test/webhook",
    body: `{"id":"${id}"}`,
    signature: "sig",
    failures: 0,
  };
  return { runAt, job };
}

/** Uji kontrak yang wajib dipenuhi setiap implementasi WebhookQueue. */
export function defineQueueContract(name: string, create: () => WebhookQueue): void {
  describe(`kontrak antrean webhook (${name})`, () => {
    it("hanya mengklaim job yang sudah jatuh tempo, urut berdasarkan waktu", async () => {
      const queue = create();
      await queue.enqueue(scheduled("late", 3000));
      await queue.enqueue(scheduled("early", 1000));
      await queue.enqueue(scheduled("future", 9000));

      const claimed = await queue.claimDue(3000, 10, LEASE_MS);
      assert.deepEqual(
        claimed.map((item) => item.job.id),
        ["early", "late"],
      );
    });

    it("job yang sudah diklaim tidak diklaim ulang selama lease masih berlaku", async () => {
      const queue = create();
      await queue.enqueue(scheduled("once", 1000));

      assert.equal((await queue.claimDue(1000, 10, LEASE_MS)).length, 1);
      assert.equal((await queue.claimDue(1000 + LEASE_MS - 1, 10, LEASE_MS)).length, 0);
    });

    it("membatasi jumlah job yang diklaim sesuai limit", async () => {
      const queue = create();
      for (let i = 0; i < 5; i++) {
        await queue.enqueue(scheduled(`job-${i}`, 100));
      }

      assert.equal((await queue.claimDue(100, 2, LEASE_MS)).length, 2);
      assert.equal((await queue.claimDue(100, 10, LEASE_MS)).length, 3);
    });

    it("job yang sudah di-ack tidak dipulihkan meski lease-nya sudah lewat", async () => {
      const queue = create();
      await queue.enqueue(scheduled("acked", 1000));
      const [claimed] = await queue.claimDue(1000, 10, LEASE_MS);
      assert.ok(claimed);

      await queue.ack(claimed.lease);

      assert.equal(await queue.recoverExpired(1000 + LEASE_MS * 10), 0);
      assert.equal((await queue.claimDue(1000 + LEASE_MS * 10, 10, LEASE_MS)).length, 0);
    });

    it("job tanpa ack dipulihkan setelah lease berakhir dan dapat diklaim lagi", async () => {
      const queue = create();
      await queue.enqueue(scheduled("crashed", 1000));
      const [first] = await queue.claimDue(1000, 10, LEASE_MS);
      assert.ok(first);

      assert.equal(await queue.recoverExpired(1000 + LEASE_MS - 1), 0);
      assert.equal(await queue.recoverExpired(1000 + LEASE_MS), 1);

      const [second] = await queue.claimDue(1000 + LEASE_MS, 10, LEASE_MS);
      assert.ok(second);
      assert.equal(second.job.id, "crashed");
      assert.notEqual(second.lease, first.lease);
    });
  });
}
