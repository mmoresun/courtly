import { Router } from "express";
import { HttpError } from "../errors";
import { insertCourt, listCourts, updateCourt } from "./courts.queries";
import { parseCourtInput } from "./courts.validation";

// Any logged-in user: only courts that can be booked.
export const courtsRouter = Router();

courtsRouter.get("/", async (_req, res) => {
  res.json(await listCourts({ includeInactive: false }));
});

// Admin. There is intentionally no DELETE: deactivate with PUT { isActive: false },
// so booking history is never lost.
export const adminCourtsRouter = Router();

adminCourtsRouter.get("/", async (_req, res) => {
  res.json(await listCourts({ includeInactive: true }));
});

adminCourtsRouter.post("/", async (req, res) => {
  res.status(201).json(await insertCourt(parseCourtInput(req.body)));
});

adminCourtsRouter.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(404, "Court not found");

  const court = await updateCourt(id, parseCourtInput(req.body));
  if (!court) throw new HttpError(404, "Court not found");
  res.json(court);
});
