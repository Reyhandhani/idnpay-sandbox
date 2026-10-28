import type { FastifyReply, FastifyRequest } from "fastify";
import type { CreateChargeInput, PaymentService } from "../services/payment-service";
import { toTransactionView } from "../services/transaction-view";

export function createChargeController(payments: PaymentService) {
  return async function createCharge(
    request: FastifyRequest<{ Body: CreateChargeInput }>,
    reply: FastifyReply,
  ) {
    const key = request.headers["idempotency-key"];
    const transaction = await payments.createCharge(request.body, typeof key === "string" ? key : undefined);
    return reply.code(201).send(toTransactionView(transaction));
  };
}
