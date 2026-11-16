import express from "express";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  await pool.query("SELECT 1");
  res.json({ status: "ok" });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API listening on :${port}`));
