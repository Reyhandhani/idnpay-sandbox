import { errors } from "../errors";
import type { Transaction } from "../types";

export interface TransactionStoreOptions {
  /** Jumlah maksimum transaksi di memori. */
  readonly maxSize: number;
}

/**
 * Bounded in-memory store. When full it evicts the oldest finished transaction and
 * never a PENDING one, since those can still be paid or expire.
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

  findByOrderId(orderId: string): Transaction | undefined {
    const id = this.idByOrderId.get(orderId);
    return id === undefined ? undefined : this.byId.get(id);
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
