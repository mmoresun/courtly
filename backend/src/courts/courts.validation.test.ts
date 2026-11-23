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
  rejects({ ...valid, opensAt: "08:30" }, /opensAt/);
  rejects({ ...valid, closesAt: "23:15" }, /closesAt/);
  rejects({ ...valid, opensAt: "8:00" }, /opensAt/);
});

test("court must open before it closes", () => {
  rejects({ ...valid, opensAt: "10:00", closesAt: "10:00" }, /earlier/);
  rejects({ ...valid, opensAt: "22:00", closesAt: "08:00" }, /earlier/);
});

test("price must be a positive whole number of cents", () => {
  rejects({ ...valid, hourlyPriceCents: 0 }, /hourlyPriceCents/);
  rejects({ ...valid, hourlyPriceCents: 24.5 }, /hourlyPriceCents/);
  rejects({ ...valid, hourlyPriceCents: "2400" }, /hourlyPriceCents/);
});

test("isActive is required, so PUT can never reactivate a court by accident", () => {
  const { isActive: _, ...withoutIsActive } = valid;
  rejects(withoutIsActive, /isActive/);
});
