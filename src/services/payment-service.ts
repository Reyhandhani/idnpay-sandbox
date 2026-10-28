import type { FastifyBaseLogger } from "fastify";
import type { Bank, EwalletProvider, PaymentType, TransactionStatus } from "../config/constants";
import type { TransactionStore } from "./transaction-store";
import { AppError, errors } from "../errors";
import type { WebhookQueue } from "../queues/webhook-queue";
import type { Transaction } from "../types";
import { buildPaymentDetails, newTransactionId } from "./payment-details";
import { buildWebhookJob } from "./webhook-job";
import { describeError } from "../errors";

export interface CreateChargeInput {
  readonly order_id: string;
  readonly gross_amount: number;
  readonly payment_type: PaymentType;
  readonly callback_url: string;
  readonly bank?: Bank;
  readonly ewallet?: EwalletProvider;
}

export interface PaymentServiceOptions {
  readonly store: TransactionStore;
  readonly queue: WebhookQueue;
  readonly logger: FastifyBaseLogger;
  readonly secretKey: string;
  readonly merchantName: string;
  readonly merchantCity: string;
  readonly chargeExpiryMinutes: number;
  readonly clock?: () => number;
}

/**
 * Mengatur siklus hidup transaksi: PENDING menuju PAID, EXPIRED, atau FAILED.
 * Setiap perubahan status menghasilkan tepat satu webhook yang ditandatangani.
 */
export class PaymentService {
  private readonly clock: () => number;
  private readonly transitioning = new Set<string>();

  constructor(private readonly options: PaymentServiceOptions) {
    this.clock = options.clock ?? Date.now;
  }

  async createCharge(input: CreateChargeInput): Promise<Transaction> {
    assertCallbackUrl(input.callback_url);

    const transactionId = newTransactionId();
    const payment = buildPaymentDetails(
      {
        orderId: input.order_id,
        grossAmount: input.gross_amount,
        paymentType: input.payment_type,
        bank: input.bank,
        ewallet: input.ewallet,
        transactionId,
      },
      { name: this.options.merchantName, city: this.options.merchantCity },
    );

    const now = this.clock();
    const transaction: Transaction = {
      transaction_id: transactionId,
      order_id: input.order_id,
      gross_amount: input.gross_amount,
      payment_type: input.payment_type,
      callback_url: input.callback_url,
      payment,
      created_at: now,
      expires_at: now + this.options.chargeExpiryMinutes * 60 * 1000,
      status: "PENDING",
      paid_at: null,
    };

    this.options.store.insert(transaction);
    this.options.logger.info(
      { transaction_id: transactionId, order_id: input.order_id, payment_type: input.payment_type },
      "Transaksi baru dibuat.",
    );
    return transaction;
  }

  async getTransaction(transactionId: string): Promise<Transaction> {
    const transaction = this.options.store.findById(transactionId);
    if (!transaction) {
      throw errors.notFound(transactionId);
    }
    await this.expireIfDue(transaction);
    return transaction;
  }

  async listTransactions(): Promise<Transaction[]> {
    const transactions = this.options.store.findAll();
    await Promise.all(transactions.map((transaction) => this.expireIfDue(transaction)));
    return transactions.sort((a, b) => b.created_at - a.created_at);
  }

  async simulatePay(transactionId: string): Promise<Transaction> {
    return this.simulate(transactionId, "PAID");
  }

  async simulateFail(transactionId: string): Promise<Transaction> {
    return this.simulate(transactionId, "FAILED");
  }

  async simulateExpire(transactionId: string): Promise<Transaction> {
    return this.simulate(transactionId, "EXPIRED");
  }

  /** Menandai semua transaksi PENDING yang telah melewati batas waktu sebagai EXPIRED. */
  async expireDueTransactions(): Promise<number> {
    let expired = 0;
    for (const transaction of this.options.store.findAll()) {
      if (await this.expireIfDue(transaction)) {
        expired++;
      }
    }
    return expired;
  }

  private async simulate(transactionId: string, next: TransactionStatus): Promise<Transaction> {
    const transaction = await this.getTransaction(transactionId);
    await this.transition(transaction, next);
    return transaction;
  }

  private async expireIfDue(transaction: Transaction): Promise<boolean> {
    if (
      transaction.status !== "PENDING" ||
      this.clock() < transaction.expires_at ||
      this.transitioning.has(transaction.transaction_id)
    ) {
      return false;
    }
    await this.transition(transaction, "EXPIRED");
    return true;
  }

  /**
   * Memindahkan transaksi ke status baru. Webhook dijadwalkan lebih dulu, baru status
   * diubah. Jika penjadwalan gagal, status tetap PENDING sehingga aksi bisa diulang
   * tanpa kehilangan notifikasi.
   */
  private async transition(transaction: Transaction, next: TransactionStatus): Promise<void> {
    const transactionId = transaction.transaction_id;
    if (transaction.status !== "PENDING") {
      throw errors.invalidState(transactionId, transaction.status);
    }
    if (this.transitioning.has(transactionId)) {
      throw errors.transactionBusy(transactionId);
    }

    this.transitioning.add(transactionId);
    try {
      const now = this.clock();
      const job = buildWebhookJob({
        transaction,
        status: next,
        now,
        secretKey: this.options.secretKey,
      });
      await this.options.queue.enqueue({ runAt: now, job });
      transaction.status = next;
      if (next === "PAID") {
        transaction.paid_at = now;
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      this.options.logger.error(
        { transaction_id: transactionId, err: describeError(error) },
        "Gagal menjadwalkan webhook. Status transaksi tidak diubah.",
      );
      throw errors.queueUnavailable();
    } finally {
      this.transitioning.delete(transactionId);
    }

    this.options.logger.info(
      { transaction_id: transactionId, transaction_status: next },
      "Status transaksi berubah, webhook dijadwalkan.",
    );
  }
}

function assertCallbackUrl(callbackUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    throw errors.validation("callback_url harus berupa URL yang valid.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw errors.validation("callback_url harus menggunakan protokol http atau https.");
  }
}
