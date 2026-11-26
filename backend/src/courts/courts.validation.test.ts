import { test } from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../errors";
import { parseCourtInput } from "./courts.validation";

const valid = {
  name: " Padel 3 ",
  sport: "Padel",
  hourlyPriceCents: 2400,
  opensAt: "08:00",
  closesAt: "23:00",
  isActive: true,
};

function rejects(body: unknown, message: RegExp): void {
  assert.throws(() => parseCourtInput(body), (err) => err instanceof HttpError && err.status === 400 && message.test(err.message));
}

test("accepts a valid court and normalizes name and sport", () => {
  assert.deepEqual(parseCourtInput(valid), { ...valid, name: "Padel 3", sport: "padel" });
});

test("opening hours must be whole hours", () => {
  rejects({ ...valid, opensAt: "08:30" }, /Opening time/);
  rejects({ ...valid, closesAt: "23:15" }, /Closing time/);
  rejects({ ...valid, opensAt: "8:00" }, /Opening time/);
});

test("closing earlier than opening is a court open past midnight; the same time is around the clock", () => {
  assert.equal(parseCourtInput({ ...valid, opensAt: "20:00", closesAt: "02:00" }).closesAt, "02:00");
  assert.equal(parseCourtInput({ ...valid, opensAt: "00:00", closesAt: "00:00" }).opensAt, "00:00");
});

test("price must be a positive whole number of cents", () => {
  rejects({ ...valid, hourlyPriceCents: 0 }, /Price/);
  rejects({ ...valid, hourlyPriceCents: 24.5 }, /Price/);
  rejects({ ...valid, hourlyPriceCents: "2400" }, /Price/);
});

test("isActive is required, so PUT can never reactivate a court by accident", () => {
  const { isActive: _, ...withoutIsActive } = valid;
  rejects(withoutIsActive, /Active/);
});
