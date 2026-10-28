import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors";

interface ErrorBody {
  readonly status_code: string;
  readonly status_message: string;
  readonly error_code: string;
  readonly details?: ReadonlyArray<{ readonly field: string; readonly rule: string }>;
}

interface ValidationViolation {
  readonly instancePath: string;
  readonly keyword: string;
  readonly params: Record<string, unknown>;
}

/** Gives every error response the same shape, with a short English message. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler(handleError);
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(body("404", `Route ${request.method} ${request.url} was not found.`, "NOT_FOUND")),
  );
}

function handleError(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send(body(String(error.statusCode), error.message, error.code));
  }

  if (error.validation) {
    return reply.code(400).send({
      ...body("400", "Request validation failed. Check the fields listed in details.", "VALIDATION_ERROR"),
      details: error.validation.map(describeViolation),
    });
  }

  if (typeof error.statusCode === "number" && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send(
        body(
          String(error.statusCode),
          "Request body is not valid JSON. Check that Content-Type is application/json.",
          "BAD_REQUEST",
        ),
      );
  }

  request.log.error({ err: error }, "Unexpected server error.");
  return reply.code(500).send(body("500", "Internal server error.", "INTERNAL_ERROR"));
}

function body(statusCode: string, message: string, errorCode: string): ErrorBody {
  return { status_code: statusCode, status_message: message, error_code: errorCode };
}

function describeViolation(violation: ValidationViolation) {
  const pathField = violation.instancePath.replace(/^\//, "");
  const missing = violation.params.missingProperty ?? violation.params.additionalProperty;
  const missingField = typeof missing === "string" ? missing : "";
  return { field: pathField || missingField, rule: violation.keyword };
}
