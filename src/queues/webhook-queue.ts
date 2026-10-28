import type { WebhookJob } from "../types";

export interface ScheduledJob {
  readonly runAt: number;
  readonly job: WebhookJob;
}

export interface ClaimedJob {
  readonly job: WebhookJob;
  /** Token used to ack the job. Valid until the lease ends. */
  readonly lease: string;
}

/**
 * Webhook queue with at-least-once semantics.
 *
 * A claimed job is held as a lease. The job is removed only after the worker calls
 * `ack`. If the worker dies first, `recoverExpired` puts the job back once its
 * lease runs out.
 */
export interface WebhookQueue {
  enqueue(scheduled: ScheduledJob): Promise<void>;
  claimDue(now: number, limit: number, leaseMs: number): Promise<ClaimedJob[]>;
  ack(lease: string): Promise<void>;
  /** Puts jobs with expired leases back in the queue. Returns how many were recovered. */
  recoverExpired(now: number): Promise<number>;
  close(): Promise<void>;
}

interface LeasedJob {
  readonly job: WebhookJob;
  readonly leaseUntil: number;
}

export class MemoryWebhookQueue implements WebhookQueue {
  private scheduled: ScheduledJob[] = [];
  private readonly leased = new Map<string, LeasedJob>();
  private sequence = 0;

  async enqueue(item: ScheduledJob): Promise<void> {
    this.scheduled.push(item);
    this.scheduled.sort((a, b) => a.runAt - b.runAt);
  }

  async claimDue(now: number, limit: number, leaseMs: number): Promise<ClaimedJob[]> {
    const claimed: ClaimedJob[] = [];
    while (claimed.length < limit) {
      const next = this.scheduled[0];
      if (!next || next.runAt > now) {
        break;
      }
      this.scheduled.shift();
      this.sequence += 1;
      const lease = `lease-${this.sequence}`;
      this.leased.set(lease, { job: next.job, leaseUntil: now + leaseMs });
      claimed.push({ job: next.job, lease });
    }
    return claimed;
  }

  async ack(lease: string): Promise<void> {
    this.leased.delete(lease);
  }

  async recoverExpired(now: number): Promise<number> {
    let recovered = 0;
    for (const [lease, entry] of this.leased) {
      if (entry.leaseUntil <= now) {
        this.leased.delete(lease);
        this.scheduled.push({ runAt: now, job: entry.job });
        recovered += 1;
      }
    }
    this.scheduled.sort((a, b) => a.runAt - b.runAt);
    return recovered;
  }

  async close(): Promise<void> {
    this.scheduled = [];
    this.leased.clear();
  }
}
