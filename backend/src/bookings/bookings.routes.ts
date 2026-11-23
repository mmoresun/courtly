import { Router } from "express";
import { currentUser } from "../auth";
import { findCourt } from "../courts/courts.queries";
import { HttpError } from "../errors";
import { facilityNow, insertBooking } from "./bookings.queries";
import { bookingRuleViolation, firstBookableHour, hourOf } from "./bookings.rules";
import { parseBookingRequest } from "./bookings.validation";

export const bookingsRouter = Router();

// POST /api/bookings { courtId, date: "YYYY-MM-DD", startHour, hours: 1 | 2 }
bookingsRouter.post("/", async (req, res) => {
  const user = currentUser(req); // the owner always comes from the token, never from the body
  const request = parseBookingRequest(req.body);

  const court = await findCourt(request.courtId);
  // Same answer as availability: an inactive court looks like a missing one.
  if (!court || !court.isActive) throw new HttpError(404, "Court not found");

  const violation = bookingRuleViolation({
    startHour: request.startHour,
    hours: request.hours,
    opensHour: hourOf(court.opensAt),
    closesHour: hourOf(court.closesAt),
    firstBookableHour: firstBookableHour(request.date, await facilityNow()),
  });
  if (violation) throw new HttpError(400, violation);

  // No "is it free?" pre-check: the database constraint is the only overlap check (→ 409).
  const booking = await insertBooking({
    ...request,
    userId: user.id,
    totalPriceCents: court.hourlyPriceCents * request.hours, // price is computed here, never sent by the client
  });
  res.status(201).json(booking);
});
