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

/** Menjadikan seluruh respons kesalahan berbentuk sama, dengan pesan dalam Bahasa Indonesia. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler(handleError);
  app.setNotFoundHandler((request, reply) =>
    reply.code(404).send(body("404", `Rute ${request.method} ${request.url} tidak ditemukan.`, "NOT_FOUND")),
  );
}

function handleError(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (error instanceof AppError) {
    return reply.code(error.statusCode).send(body(String(error.statusCode), error.message, error.code));
  }

  if (error.validation) {
    return reply.code(400).send({
      ...body("400", "Permintaan tidak valid. Periksa field yang ditandai.", "VALIDATION_ERROR"),
      details: error.validation.map(describeViolation),
    });
  }

  if (typeof error.statusCode === "number" && error.statusCode < 500) {
    return reply
      .code(error.statusCode)
      .send(
        body(
          String(error.statusCode),
          "Body JSON tidak dapat dibaca. Pastikan Content-Type application/json.",
          "BAD_REQUEST",
        ),
      );
  }

  request.log.error({ err: error }, "Terjadi kesalahan tidak terduga.");
  return reply.code(500).send(body("500", "Terjadi kesalahan internal.", "INTERNAL_ERROR"));
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
