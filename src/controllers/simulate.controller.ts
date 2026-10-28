import type { FastifyReply, FastifyRequest } from "fastify";
import type { PaymentService } from "../services/payment-service";
import { toTransactionView } from "../services/transaction-view";

type SimulateRequest = FastifyRequest<{ Body: { transaction_id: string } }>;
type SimulateHandler = (request: SimulateRequest, reply: FastifyReply) => Promise<FastifyReply>;

export interface SimulateController {
  readonly pay: SimulateHandler;
  readonly fail: SimulateHandler;
  readonly expire: SimulateHandler;
}

export function createSimulateController(payments: PaymentService): SimulateController {
  return {
    pay: async (request, reply) => {
      const transaction = await payments.simulatePay(request.body.transaction_id);
      return reply.send(toTransactionView(transaction));
    },
    fail: async (request, reply) => {
      const transaction = await payments.simulateFail(request.body.transaction_id);
      return reply.send(toTransactionView(transaction));
    },
    expire: async (request, reply) => {
      const transaction = await payments.simulateExpire(request.body.transaction_id);
      return reply.send(toTransactionView(transaction));
    },
  };
}
