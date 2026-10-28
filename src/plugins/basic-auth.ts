import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { errors } from "../errors";

/**
 * Midtrans authenticates with HTTP Basic, using the server key as the username and an
 * empty password. The same key signs webhooks, so it is not a separate secret.
 */
export function requireServerKey(serverKey: string) {
  const expected = Buffer.from(`Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`, "utf8");

  return async function verifyServerKey(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = request.headers.authorization;
    const received = Buffer.from(typeof header === "string" ? header : "", "utf8");
    const matches = received.length === expected.length && timingSafeEqual(received, expected);
    if (!matches) {
      throw errors.unauthorized();
    }
  };
}
