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
  unauthorized: () => new AppError(401, "UNAUTHORIZED", "Client key tidak valid atau tidak ada."),
  notFound: (transactionId: string) =>
    new AppError(404, "TRANSACTION_NOT_FOUND", `Transaksi ${transactionId} tidak ditemukan.`),
  duplicateOrder: (orderId: string) =>
    new AppError(409, "DUPLICATE_ORDER_ID", `order_id ${orderId} sudah pernah digunakan.`),
  invalidState: (transactionId: string, status: string) =>
    new AppError(
      409,
      "INVALID_TRANSACTION_STATE",
      `Transaksi ${transactionId} berstatus ${status} dan tidak dapat diubah.`,
    ),
  transactionBusy: (transactionId: string) =>
    new AppError(
      409,
      "TRANSACTION_BUSY",
      `Transaksi ${transactionId} sedang diproses. Coba lagi sebentar lagi.`,
    ),
  queueUnavailable: () =>
    new AppError(
      503,
      "QUEUE_UNAVAILABLE",
      "Antrean webhook tidak tersedia. Status transaksi belum diubah, silakan coba lagi.",
    ),
  storeFull: () =>
    new AppError(
      503,
      "STORE_FULL",
      "Penyimpanan transaksi penuh dan tidak ada transaksi selesai yang dapat dihapus.",
    ),
  simulatedFailure: () =>
    new AppError(503, "SIMULATED_UPSTREAM_FAILURE", "Kegagalan jaringan disimulasikan."),
};

/** Mengambil pesan dari nilai apa pun yang dilempar, untuk keperluan logging. */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
