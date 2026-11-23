import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../errors";
import { parseDate } from "./bookings.validation";

test("parseDate accepts real YYYY-MM-DD dates", () => {
  assert.equal(parseDate("2026-11-24"), "2026-11-24");
  assert.equal(parseDate("2028-02-29"), "2028-02-29"); // leap year
});

test("parseDate rejects wrong formats and impossible dates with 400", () => {
  for (const bad of [undefined, "", "2026-1-5", "24-11-2026", "2026-02-30", "2026-13-01", ["2026-11-24"]]) {
    assert.throws(() => parseDate(bad), (err) => err instanceof HttpError && err.status === 400, String(bad));
  }
});
