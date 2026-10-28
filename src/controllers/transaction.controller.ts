import type { FastifyReply, FastifyRequest } from "fastify";
import type { PaymentService } from "../services/payment-service";
import { toTransactionView } from "../services/transaction-view";

export interface TransactionController {
  readonly get: (
    request: FastifyRequest<{ Params: { transaction_id: string } }>,
    reply: FastifyReply,
  ) => Promise<FastifyReply>;
  readonly list: (
    request: FastifyRequest<{ Querystring: { limit: number } }>,
    reply: FastifyReply,
  ) => Promise<FastifyReply>;
}

export function createTransactionController(payments: PaymentService): TransactionController {
  return {
    get: async (request, reply) => {
      const transaction = await payments.getTransaction(request.params.transaction_id);
      return reply.send(toTransactionView(transaction));
    },
    list: async (request, reply) => {
      const transactions = await payments.listTransactions();
      const views = transactions.slice(0, request.query.limit).map(toTransactionView);
      return reply.send({ data: views, total: transactions.length });
    },
  };
}
