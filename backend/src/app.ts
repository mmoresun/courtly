import express from "express";
import { authRouter, meHandler, requireAuth, requireRole } from "./auth";
import { bookingsRouter } from "./bookings/bookings.routes";
import { adminCourtsRouter, courtsRouter } from "./courts/courts.routes";
import { pool } from "./db";
import { errorHandler, HttpError } from "./errors";

// The whole HTTP API. index.ts starts it; tests start it on a random port.
export const app = express();
app.use(express.json());

// Public
app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});
app.use("/api/auth", authRouter);

// Everything below requires a valid token; /api/admin additionally requires the admin role.
app.use("/api", requireAuth);
app.use("/api/admin", requireRole("admin"));

app.get("/api/me", meHandler);
app.use("/api/courts", courtsRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/admin/courts", adminCourtsRouter);

app.use((_req, _res) => {
  throw new HttpError(404, "Not found");
});
app.use(errorHandler);
