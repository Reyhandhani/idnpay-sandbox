import { errors } from "../errors";
import type { Transaction } from "../types";

export interface TransactionStoreOptions {
  /** Jumlah maksimum transaksi di memori. */
  readonly maxSize: number;
}

/**
 * In-memory transaction store with a size limit.
 *
 * When full, the oldest finished transaction (anything but PENDING) is evicted.
 * PENDING transactions are never evicted because they can still be paid or expire.
 * Everything is lost when the process stops, which is fine for a test tool.
 */
export class TransactionStore {
  private readonly byId = new Map<string, Transaction>();
  private readonly idByOrderId = new Map<string, string>();

  constructor(private readonly options: TransactionStoreOptions) {}

  insert(transaction: Transaction): void {
    if (this.idByOrderId.has(transaction.order_id)) {
      throw errors.duplicateOrder(transaction.order_id);
    }
    if (this.byId.size >= this.options.maxSize && !this.evictOldestTerminal()) {
      throw errors.storeFull();
    }
    this.byId.set(transaction.transaction_id, transaction);
    this.idByOrderId.set(transaction.order_id, transaction.transaction_id);
  }

  findById(transactionId: string): Transaction | undefined {
    return this.byId.get(transactionId);
  }

  findAll(): Transaction[] {
    return [...this.byId.values()];
  }

  /** Map preserves insertion order, so the first finished entry is the oldest. */
  private evictOldestTerminal(): boolean {
    for (const transaction of this.byId.values()) {
      if (transaction.status !== "PENDING") {
        this.byId.delete(transaction.transaction_id);
        this.idByOrderId.delete(transaction.order_id);
        return true;
      }
    }
    return false;
  }
}
