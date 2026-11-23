import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { errorHandler, HttpError } from "./errors";

function handle(err: unknown): { status: number; body: unknown } {
  const out = { status: 0, body: undefined as unknown };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: unknown) {
      out.body = body;
      return this;
    },
  } as unknown as Response;
  errorHandler(err, {} as Request, res, () => {});
  return out;
}

test("HttpError keeps its status and message", () => {
  assert.deepEqual(handle(new HttpError(404, "Court not found")), { status: 404, body: { error: "Court not found" } });
});

test("a violated CHECK constraint (23514) is a 400 that hides the constraint name but logs it as an error", (t) => {
  const log = t.mock.method(console, "error", () => {});
  const pgError = Object.assign(new Error("check violation"), { code: "23514", constraint: "bookings_check" });

  assert.deepEqual(handle(pgError), { status: 400, body: { error: "Invalid data" } });
  assert.equal(log.mock.callCount(), 1);
  assert.match(String(log.mock.calls[0]!.arguments[0]), /bookings_check/);
});

test("unexpected errors become 500 without leaking details", (t) => {
  t.mock.method(console, "error", () => {});
  assert.deepEqual(handle(new Error("secret internals")), { status: 500, body: { error: "Internal server error" } });
});
