import express from "express";
import { authRouter, requireAuth, requireRole } from "./auth";
import { config } from "./config";
import { pool } from "./db";
import { errorHandler, HttpError } from "./errors";

const app = express();
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

app.use((_req, _res) => {
  throw new HttpError(404, "Not found");
});
app.use(errorHandler);

app.listen(config.port, () => console.log(`API listening on :${config.port}`));
