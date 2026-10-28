import type { FastifyBaseLogger } from "fastify";
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, WEBHOOK_BASE_DELAY_MS } from "../config/constants";
import type { WebhookJob } from "../types";
import type { ClaimedJob, WebhookQueue } from "./webhook-queue";
import { describeError } from "../errors";

export interface WebhookWorkerOptions {
  readonly queue: WebhookQueue;
  readonly logger: FastifyBaseLogger;
  readonly retryLimit: number;
  readonly timeoutMs: number;
  readonly tickMs: number;
  readonly batchSize?: number;
  readonly clock?: () => number;
  readonly fetchImpl?: typeof fetch;
}

/** Waktu tambahan di atas batas timeout agar lease tidak habis saat respons sedang diproses. */
const LEASE_MARGIN_MS = 5_000;

/**
 * Mengirim webhook ke callback_url dan menjadwalkan ulang job yang gagal dengan backoff
 * eksponensial: percobaan setelah kegagalan ke-n dilakukan 2^n × 1000 ms kemudian.
 * Percobaan maksimum adalah 1 + retryLimit.
 *
 * Job di-ack setelah hasilnya tercatat (berhasil, dijadwalkan ulang, atau menyerah).
 * Jika penjadwalan ulang gagal, job tidak di-ack dan akan dipulihkan setelah lease habis.
 */
export class WebhookWorker {
  private timer: NodeJS.Timeout | undefined;
  private inFlight: Promise<void> | undefined;

  private readonly batchSize: number;
  private readonly clock: () => number;
  private readonly fetchImpl: typeof fetch;
  private readonly leaseMs: number;

  constructor(private readonly options: WebhookWorkerOptions) {
    this.batchSize = options.batchSize ?? 20;
    this.clock = options.clock ?? Date.now;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.leaseMs = options.timeoutMs + LEASE_MARGIN_MS;
  }

  start(): void {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => void this.tick(), this.options.tickMs);
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
    await this.inFlight;
  }

  /** Memulihkan job yang lease-nya habis, lalu memproses job yang sudah jatuh tempo. */
  tick(): Promise<void> {
    if (!this.inFlight) {
      this.inFlight = this.processBatch().finally(() => {
        this.inFlight = undefined;
      });
    }
    return this.inFlight;
  }

  private async processBatch(): Promise<void> {
    const logger = this.options.logger;
    try {
      const now = this.clock();
      const recovered = await this.options.queue.recoverExpired(now);
      if (recovered > 0) {
        logger.warn({ recovered }, "Job webhook dengan lease kedaluwarsa dikembalikan ke antrean.");
      }
      const claimed = await this.options.queue.claimDue(now, this.batchSize, this.leaseMs);
      await Promise.allSettled(claimed.map((item) => this.deliver(item)));
    } catch (error) {
      logger.error({ err: describeError(error) }, "Gagal mengambil job webhook dari antrean.");
    }
  }

  private async deliver({ job, lease }: ClaimedJob): Promise<void> {
    const attempt = job.failures + 1;
    const log = this.options.logger.child({
      transaction_id: job.transaction_id,
      webhook_id: job.id,
      attempt,
    });

    let reason: string;
    try {
      const response = await this.fetchImpl(job.callback_url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "idnpay-sandbox/0.1",
          [SIGNATURE_HEADER]: job.signature,
          [TIMESTAMP_HEADER]: Math.floor(this.clock() / 1000).toString(),
        },
        body: job.body,
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
      await response.body?.cancel().catch(() => undefined);

      if (response.ok) {
        log.info({ status: response.status }, "Webhook berhasil dikirim.");
        await this.ack(lease, log);
        return;
      }
      reason = `HTTP ${response.status}`;
    } catch (error) {
      reason = describeError(error);
    }

    await this.handleFailure(job, lease, reason, log);
  }

  private async handleFailure(
    job: WebhookJob,
    lease: string,
    reason: string,
    log: FastifyBaseLogger,
  ): Promise<void> {
    const failures = job.failures + 1;
    if (failures > this.options.retryLimit) {
      log.error({ reason, failures }, "Webhook gagal setelah batas percobaan tercapai.");
      await this.ack(lease, log);
      return;
    }

    const delayMs = 2 ** failures * WEBHOOK_BASE_DELAY_MS;
    try {
      await this.options.queue.enqueue({ runAt: this.clock() + delayMs, job: { ...job, failures } });
    } catch (error) {
      log.error(
        { reason, err: describeError(error) },
        "Gagal menjadwalkan ulang webhook. Job akan dipulihkan setelah lease berakhir.",
      );
      return;
    }

    log.warn({ reason, retry_in_ms: delayMs }, "Webhook gagal dikirim, percobaan ulang dijadwalkan.");
    await this.ack(lease, log);
  }

  private async ack(lease: string, log: FastifyBaseLogger): Promise<void> {
    try {
      await this.options.queue.ack(lease);
    } catch (error) {
      log.error({ err: describeError(error) }, "Gagal mengonfirmasi job webhook.");
    }
  }
}
