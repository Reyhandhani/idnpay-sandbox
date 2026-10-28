import { randomInt } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { errors } from "../errors";

export interface NetworkSimulation {
  readonly latencyMs: number;
  readonly failureRate: number;
}

/**
 * Menambahkan latensi dan kegagalan acak pada request untuk menguji
 * ketahanan aplikasi terhadap jaringan yang tidak stabil.
 */
export function simulateNetwork(simulation: NetworkSimulation) {
  return async function applyNetworkSimulation(
    _request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    if (simulation.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, simulation.latencyMs));
    }
    if (simulation.failureRate > 0 && randomInt(1_000_000) < simulation.failureRate * 1_000_000) {
      throw errors.simulatedFailure();
    }
  };
}
