import { randomInt } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { errors } from "../errors";

export interface NetworkSimulation {
  readonly latencyMs: number;
  readonly failureRate: number;
  readonly failureStatus: number;
}

/**
 * Adds latency and random failures to requests so you can test how your app
 * behaves on an unstable network.
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
      throw errors.simulatedFailure(simulation.failureStatus);
    }
  };
}
