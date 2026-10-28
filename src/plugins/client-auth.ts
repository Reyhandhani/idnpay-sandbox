import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { CLIENT_KEY_HEADER } from "../config/constants";
import { errors } from "../errors";

export function requireClientKey(expectedKey: string) {
  const expected = Buffer.from(expectedKey, "utf8");

  return async function verifyClientKey(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers[CLIENT_KEY_HEADER];
    const received = Buffer.from(typeof header === "string" ? header : "", "utf8");

    const matches = received.length === expected.length && timingSafeEqual(received, expected);
    if (!matches) {
      throw errors.unauthorized();
    }
  };
}
