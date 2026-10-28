import type { FastifyReply, FastifyRequest } from "fastify";
import type { PaymentService } from "../services/payment-service";
import {
  mapCharge,
  type MidtransChargeInput,
  toMidtransResponse,
  UnsupportedPaymentType,
} from "../services/midtrans";

export interface MidtransController {
  readonly charge: (
    request: FastifyRequest<{ Body: MidtransChargeInput }>,
    reply: FastifyReply,
  ) => Promise<FastifyReply>;
  readonly status: (
    request: FastifyRequest<{ Params: { order_id: string } }>,
    reply: FastifyReply,
  ) => Promise<FastifyReply>;
}

export function createMidtransController(payments: PaymentService): MidtransController {
  return {
    charge: async (request, reply) => {
      let mapped;
      try {
        mapped = mapCharge(request.body);
      } catch (error) {
        if (error instanceof UnsupportedPaymentType) {
          return reply.code(400).send({
            status_code: "400",
            status_message: error.message,
            error_messages: [error.message],
          });
        }
        throw error;
      }

      const key = request.headers["idempotency-key"];
      const transaction = await payments.createCharge(
        {
          flavor: "midtrans",
          order_id: mapped.orderId,
          gross_amount: mapped.grossAmount,
          payment_type: mapped.paymentType,
          bank: mapped.bank,
          ewallet: mapped.ewallet,
          callback_url: request.body.callback_url,
        },
        typeof key === "string" ? key : undefined,
      );

      return reply.code(201).send(toMidtransResponse(transaction));
    },

    status: async (request, reply) => {
      const transaction = await payments.getByOrderId(request.params.order_id);
      return reply.send(toMidtransResponse(transaction));
    },
  };
}
