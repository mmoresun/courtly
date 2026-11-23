import { Router } from "express";
import { currentUser } from "../auth";
import { findCourt } from "../courts/courts.queries";
import { HttpError, parseIdParam } from "../errors";
import { adminDay, cancelBooking, facilityNow, findBookingForCancel, insertBooking, listUserBookings } from "./bookings.queries";
import { bookingRuleViolation, CANCELLATION_WINDOW_HOURS, canCancel, firstBookableHour, hourOf } from "./bookings.rules";
import { parseBookingRequest, parseDate } from "./bookings.validation";

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

// GET /api/bookings → the current user's own bookings: { upcoming, past }
bookingsRouter.get("/", async (req, res) => {
  res.json(await listUserBookings(currentUser(req).id));
});

// POST /api/bookings/:id/cancel — POST, not DELETE: the booking isn't deleted, its status changes.
// Checks go owner → status → time window, so answers never reveal anything about others' bookings.
// Only the owner can cancel, admins included (the brief only gives admins a read-only view).
bookingsRouter.post("/:id/cancel", async (req, res) => {
  const user = currentUser(req);
  const id = parseIdParam(req.params.id, "Booking not found");

  const booking = await findBookingForCancel(id);
  // Someone else's booking looks exactly like a missing one.
  if (!booking || booking.userId !== user.id) throw new HttpError(404, "Booking not found");
  if (booking.status === "cancelled") throw new HttpError(409, "This booking is already cancelled");
  if (!canCancel(booking.startAt, booking.now)) {
    throw new HttpError(400, `Bookings can only be cancelled up to ${CANCELLATION_WINDOW_HOURS} hours before they start`);
  }

  const cancelled = await cancelBooking(id);
  if (!cancelled) throw new HttpError(409, "This booking is already cancelled"); // a parallel cancel won
  res.json(cancelled);
});

// Admin (mounted under /api/admin, so the admin role is already checked).
export const adminBookingsRouter = Router();

// GET /api/admin/bookings?date=YYYY-MM-DD → all bookings of that facility day + expected revenue
adminBookingsRouter.get("/", async (req, res) => {
  const date = parseDate(req.query.date);
  res.json({ date, ...(await adminDay(date)) });
});
