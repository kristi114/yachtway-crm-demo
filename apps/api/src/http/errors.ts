import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

interface HttpishError {
  status?: number;
  statusCode?: number;
  type?: string;
  message?: string;
}

/**
 * Terminal error handler. Zod validation failures become 400s with the issue
 * list; errors that already carry a 4xx status (e.g. body-parser's malformed
 * JSON, or http-errors) are surfaced as that client error; everything else is a
 * 500 with the detail logged, not leaked. Express 5 forwards rejected promises
 * from async handlers here automatically.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "validation_error", issues: err.issues });
    return;
  }

  const e = err as HttpishError;
  const status = e.statusCode ?? e.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({
      error: e.type === "entity.parse.failed" ? "invalid_json_body" : "bad_request",
      message: e.message,
    });
    return;
  }

  console.error("[api] unhandled error:", err);
  res.status(500).json({ error: "internal_server_error" });
};
