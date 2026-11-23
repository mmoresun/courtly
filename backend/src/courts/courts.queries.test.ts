import { test } from "node:test";
import assert from "node:assert/strict";
import { useTestDatabase } from "../test/db";
import { insertCourt, listCourts, updateCourt } from "./courts.queries";

useTestDatabase();

const court = { name: "Padel 1", sport: "padel", hourlyPriceCents: 2400, opensAt: "08:00", closesAt: "23:00", isActive: true };

test("users only see active courts, admins see all", async () => {
  const active = await insertCourt(court);
  const inactive = await insertCourt({ ...court, name: "Old", isActive: false });

  assert.deepEqual((await listCourts({ includeInactive: false })).map((c) => c.id), [active.id]);
  assert.deepEqual((await listCourts({ includeInactive: true })).map((c) => c.id), [active.id, inactive.id]);
});

test("updating a missing court returns undefined (route turns it into 404)", async () => {
  assert.equal(await updateCourt(999, court), undefined);
});
