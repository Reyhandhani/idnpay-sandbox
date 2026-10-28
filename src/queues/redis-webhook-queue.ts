import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import type { WebhookJob } from "../types";
import type { ClaimedJob, ScheduledJob, WebhookQueue } from "./webhook-queue";

const DEFAULT_PREFIX = "idnpay:webhooks";

/** Moves one member between sorted sets, but only if it is still in the source set. */
const MOVE_SCRIPT = `
if redis.call('ZREM', KEYS[1], ARGV[1]) == 1 then
  redis.call('ZADD', KEYS[2], ARGV[2], ARGV[3])
  return 1
end
return 0
`;

/** What a `leased` member contains: a per-claim token plus the job. */
interface LeaseRecord {
  readonly lease: string;
  readonly job: WebhookJob;
}

/**
 * Webhook queue backed by Redis sorted sets.
 *
 * - `delayed` holds scheduled jobs, scored by execution time (epoch ms).
 * - `leased` holds jobs in flight, scored by lease deadline. Each claim gets its own
 *   UUID token, so a stale worker cannot ack a lease now owned by someone else.
 *
 * Moving a member between sets happens inside one Lua script, so a job cannot vanish
 * between two commands. The worker that loses the race sees ZREM return 0.
 */
export class RedisWebhookQueue implements WebhookQueue {
  private readonly delayedKey: string;
  private readonly leasedKey: string;

  constructor(
    private readonly client: Redis,
    prefix: string = DEFAULT_PREFIX,
  ) {
    this.delayedKey = `${prefix}:delayed`;
    this.leasedKey = `${prefix}:leased`;
  }

  async enqueue({ runAt, job }: ScheduledJob): Promise<void> {
    await this.client.zadd(this.delayedKey, runAt, JSON.stringify(job));
  }

  async claimDue(now: number, limit: number, leaseMs: number): Promise<ClaimedJob[]> {
    const members = await this.client.zrangebyscore(this.delayedKey, "-inf", now, "LIMIT", 0, limit);
    const claimed: ClaimedJob[] = [];
    for (const member of members) {
      const job = JSON.parse(member) as WebhookJob;
      const lease = randomUUID();
      const leased: LeaseRecord = { lease, job };
      const moved = await this.move(
        this.delayedKey,
        this.leasedKey,
        member,
        now + leaseMs,
        JSON.stringify(leased),
      );
      if (moved) {
        claimed.push({ job, lease });
      }
    }
    return claimed;
  }

  async ack(lease: string): Promise<void> {
    const members = await this.client.zrange(this.leasedKey, 0, -1);
    const match = members.find((member) => (JSON.parse(member) as LeaseRecord).lease === lease);
    if (match !== undefined) {
      await this.client.zrem(this.leasedKey, match);
    }
  }

  async recoverExpired(now: number): Promise<number> {
    const members = await this.client.zrangebyscore(this.leasedKey, "-inf", now);
    let recovered = 0;
    for (const member of members) {
      const { job } = JSON.parse(member) as LeaseRecord;
      if (await this.move(this.leasedKey, this.delayedKey, member, now, JSON.stringify(job))) {
        recovered += 1;
      }
    }
    return recovered;
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  private async move(
    from: string,
    to: string,
    member: string,
    score: number,
    nextMember: string,
  ): Promise<boolean> {
    const result = await this.client.eval(MOVE_SCRIPT, 2, from, to, member, score, nextMember);
    return Number(result) === 1;
  }
}
