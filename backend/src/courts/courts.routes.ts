import { Router } from "express";
import { facilityNow, takenHours } from "../bookings/bookings.queries";
import { daySlots, hourOf } from "../bookings/bookings.rules";
import { parseDate } from "../bookings/bookings.validation";
import { HttpError, parseIdParam } from "../errors";
import { findCourt, insertCourt, listCourts, updateCourt } from "./courts.queries";
import { parseCourtInput } from "./courts.validation";

// Any logged-in user: only courts that can be booked.
export const courtsRouter = Router();

courtsRouter.get("/", async (_req, res) => {
  res.json(await listCourts({ includeInactive: false }));
});

// GET /api/courts/:id/availability?date=YYYY-MM-DD → the day's 1-hour slots.
courtsRouter.get("/:id/availability", async (req, res) => {
  const id = parseIdParam(req.params.id, "Court not found");
  const date = parseDate(req.query.date);

  const court = await findCourt(id);
  if (!court || !court.isActive) throw new HttpError(404, "Court not found");

  const [taken, now] = await Promise.all([takenHours(id, date), facilityNow()]);
  const slots = daySlots({
    date,
    opensHour: hourOf(court.opensAt),
    closesHour: hourOf(court.closesAt),
    takenHours: taken,
    now,
  });
  res.json({ courtId: id, date, slots });
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
  const id = parseIdParam(req.params.id, "Court not found");
  const court = await updateCourt(id, parseCourtInput(req.body));
  if (!court) throw new HttpError(404, "Court not found");
  res.json(court);
});
