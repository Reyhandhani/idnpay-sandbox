export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const errors = {
  validation: (message: string) => new AppError(400, "VALIDATION_ERROR", message),
  unauthorized: () => new AppError(401, "UNAUTHORIZED", "Client key is missing or invalid."),
  notFound: (transactionId: string) =>
    new AppError(404, "TRANSACTION_NOT_FOUND", `Transaction ${transactionId} was not found.`),
  duplicateOrder: (orderId: string) =>
    new AppError(409, "DUPLICATE_ORDER_ID", `order_id ${orderId} is already in use.`),
  invalidState: (transactionId: string, status: string) =>
    new AppError(
      409,
      "INVALID_TRANSACTION_STATE",
      `Transaction ${transactionId} is ${status} and can no longer change state.`,
    ),
  transactionBusy: (transactionId: string) =>
    new AppError(
      409,
      "TRANSACTION_BUSY",
      `Transaction ${transactionId} is being processed. Try again shortly.`,
    ),
  queueUnavailable: () =>
    new AppError(
      503,
      "QUEUE_UNAVAILABLE",
      "Webhook queue is unavailable. The transaction state was not changed, so you can retry.",
    ),
  storeFull: () =>
    new AppError(503, "STORE_FULL", "Transaction store is full and no completed transaction can be evicted."),
  simulatedFailure: () =>
    new AppError(503, "SIMULATED_UPSTREAM_FAILURE", "Simulated upstream network failure."),
};

/** Extracts a message from any thrown value, for logging. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
