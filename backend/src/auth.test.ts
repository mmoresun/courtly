// Login, tokens and roles through the real HTTP API.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { pool } from "./db";
import { createCourt, createUser, useTestDatabase } from "./test/db";
import { api, tokenFor, useTestServer } from "./test/http";

useTestDatabase();
useTestServer();

const court = { name: "New", sport: "padel", hourlyPriceCents: 2000, opensAt: "08:00", closesAt: "22:00", isActive: true };

describe("REQUIRED RULE: roles are enforced on the API, not just hidden in the UI", () => {
  test("a regular user gets 403 on every admin route: list, create, edit, deactivate", async () => {
    const user = tokenFor(await createUser("user"));
    const { id } = await createCourt();

    const attempts = [
      await api("GET", "/admin/courts", { token: user }),
      await api("POST", "/admin/courts", { token: user, body: court }),
      await api("PUT", `/admin/courts/${id}`, { token: user, body: { ...court, name: "Hacked" } }),
      await api("PUT", `/admin/courts/${id}`, { token: user, body: { ...court, isActive: false } }),
    ];
    for (const res of attempts) assert.deepEqual(res, { status: 403, body: { error: "Forbidden" } });

    // and nothing changed
    const { rows } = await pool.query("SELECT name, is_active FROM courts");
    assert.deepEqual(rows, [{ name: "Court", is_active: true }]);
  });

  test("an admin passes the same routes", async () => {
    const admin = tokenFor(await createUser("admin"), "admin");
    assert.equal((await api("GET", "/admin/courts", { token: admin })).status, 200);
    assert.equal((await api("POST", "/admin/courts", { token: admin, body: court })).status, 201);
  });

  test("a token can't promote itself: role comes from the signed token, a forged one is rejected", async () => {
    const userId = await createUser("user");
    const forged = jwt.sign({ role: "admin" }, "not-our-secret", { subject: String(userId) });
    assert.equal((await api("GET", "/admin/courts", { token: forged })).status, 401);
  });
});

describe("authentication", () => {
  test("no token, garbage token, expired token → 401 everywhere behind login", async () => {
    const userId = await createUser();
    const expired = jwt.sign({ role: "user" }, config.jwtSecret, { subject: String(userId), expiresIn: -10 });
    for (const token of [undefined, "garbage", expired]) {
      assert.equal((await api("GET", "/courts", { token })).status, 401, String(token));
      assert.equal((await api("GET", "/bookings", { token })).status, 401, String(token));
      assert.equal((await api("POST", "/bookings", { token, body: {} })).status, 401, String(token));
    }
  });

  test("login: right password → token; wrong password and unknown email → the same 401", async () => {
    const hash = await bcrypt.hash("secret123", 4);
    await pool.query("INSERT INTO users (email, password_hash, name, role) VALUES ('ann@test.io', $1, 'Ann', 'user')", [hash]);

    const ok = await api("POST", "/auth/login", { body: { email: "Ann@Test.io ", password: "secret123" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.name, "Ann");
    assert.equal((await api("GET", "/courts", { token: ok.body.token })).status, 200);

    const wrongPassword = await api("POST", "/auth/login", { body: { email: "ann@test.io", password: "nope" } });
    const unknownEmail = await api("POST", "/auth/login", { body: { email: "who@test.io", password: "secret123" } });
    assert.deepEqual(wrongPassword, { status: 401, body: { error: "Invalid email or password" } });
    assert.deepEqual(unknownEmail, wrongPassword);
  });

  test("GET /me returns the user and the facility's today", async () => {
    const userId = await createUser("admin");
    const { status, body } = await api("GET", "/me", { token: tokenFor(userId, "admin") });
    assert.equal(status, 200);
    assert.deepEqual(body.user, { id: userId, name: body.user.name, role: "admin" });
    assert.match(body.facilityToday, /^\d{4}-\d{2}-\d{2}$/);
  });
});
