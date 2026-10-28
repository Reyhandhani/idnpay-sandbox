import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../config/env";
import { createChargeController } from "../controllers/charge.controller";
import { createSimulateController } from "../controllers/simulate.controller";
import { createTransactionController } from "../controllers/transaction.controller";
import { requireClientKey } from "../plugins/client-auth";
import { simulateNetwork } from "../plugins/simulated-network";
import type { PaymentService } from "../services/payment-service";
import {
  createChargeSchema,
  listTransactionsSchema,
  simulateSchema,
  transactionParamsSchema,
} from "./schemas";

export interface RouteDependencies {
  readonly config: AppConfig;
  readonly payments: PaymentService;
}

export async function registerRoutes(
  app: FastifyInstance,
  { config, payments }: RouteDependencies,
): Promise<void> {
  const charge = createChargeController(payments);
  const simulate = createSimulateController(payments);
  const transactions = createTransactionController(payments);

  app.get("/health", async () => ({ status: "ok" }));

  await app.register(
    async (v1) => {
      v1.addHook("onRequest", simulateNetwork(config.simulation));
      v1.addHook("onRequest", requireClientKey(config.clientKey));

      v1.post("/charge", { schema: createChargeSchema }, charge);
      v1.get("/transactions", { schema: listTransactionsSchema }, transactions.list);
      v1.get("/transactions/:transaction_id", { schema: transactionParamsSchema }, transactions.get);
      v1.post("/simulate/pay", { schema: simulateSchema }, simulate.pay);
      v1.post("/simulate/fail", { schema: simulateSchema }, simulate.fail);
      v1.post("/simulate/expire", { schema: simulateSchema }, simulate.expire);
    },
    { prefix: "/v1" },
  );
}
