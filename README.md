# Courtly

A small app for booking sports courts (padel, tennis, …). Players book courts by the hour. An admin manages the courts and sees all bookings.

> Work in progress. This file records the decisions made so far, in plain words.

## How to run

```bash
git clone <repo-url>
cd courtly
docker compose up
```

Open **http://localhost:5173**.

Demo accounts (all use the password `courtly123`):

| Email                | Role  |
|----------------------|-------|
| `alice@courtly.test` | user  |
| `bob@courtly.test`   | user  |
| `admin@courtly.test` | admin |

On start, the backend container does three things in order:
1. **migrate** – creates or updates the database tables,
2. **seed** – fills in demo data, but only if the database is empty,
3. **start** – runs the API.

Backend tests: `cd backend && npm test`.

## Stack and why

**React + Vite, not Next.js.** Every page is behind a login, so we don't need what Next.js is best at: server-side rendering and SEO. The brief also asks for a separate backend anyway, so Next.js would just be a second server that does nothing useful. Vite is a plain, fast dev setup with fewer moving parts.

**Express, not NestJS.** The API is small (about ten endpoints). NestJS gives you modules, decorators and dependency injection. That helps big teams, but here it would mean more code and more "magic" to explain. The downside of Express is that it doesn't force any structure, so we keep a simple one ourselves (see below). Express 5 also catches errors from `async` handlers by itself.

**PostgreSQL, not MySQL or MongoDB.** The data is naturally made of tables that point at each other: users, courts, bookings. The deciding reason is one Postgres feature, the *exclusion constraint*. It lets the database itself refuse two bookings that overlap in time (see "No double bookings"). MySQL has nothing like it, and MongoDB would need extra workarounds.

**Plain SQL with `pg`, no ORM.** Our most important rules (no overlapping bookings, time zones) use Postgres features that an ORM would hide. With plain SQL you can read exactly what runs against the database. Migrations are plain `.sql` files too (run by `node-pg-migrate`).

**Few libraries on purpose.** Besides the ones above, the backend only adds `bcryptjs` (to hash passwords) and `jsonwebtoken` (for login tokens). Input checks are small hand-written functions instead of a validation library, because there are only a few fields to check.

## How the code is organized

- **One folder per feature** (`src/courts/`, …), split into three files:
  - `*.queries.ts` – all the SQL for this feature,
  - `*.validation.ts` – checks on incoming data, written as plain functions, so they're easy to test,
  - `*.routes.ts` – the HTTP endpoints, which only glue the other two together.
- **Errors in one place.** Any code can `throw new HttpError(404, "Court not found")`. One error handler (`src/errors.ts`) turns every error into a JSON reply like `{ "error": "..." }`. Errors we didn't expect become a `500` and are logged.
- **Settings in one place** (`src/config.ts`). The app refuses to start if a required setting such as `JWT_SECRET` is missing, instead of quietly using a default.

## Login and roles

- There is no sign-up. The brief says seeded users are enough, and sign-up would be more code with nothing to test.
- `POST /api/auth/login` checks the password against its bcrypt hash and returns a **JWT** (a signed token) that is valid for 8 hours. The token holds the user's id and role.
- A wrong email and a wrong password get the **same** error. Otherwise an attacker could find out which emails exist.
- The frontend sends the token in the `Authorization: Bearer ...` header. Storing it in `localStorage` is simpler than cookies (no CSRF protection needed). The trade-off: a script injected into the page (XSS) could read the token.
- **Roles are checked on the server, in one line** in `src/index.ts`:
  ```ts
  app.use("/api", requireAuth);                  // everything below needs a valid token
  app.use("/api/admin", requireRole("admin"));   // everything under /api/admin needs the admin role
  ```
  Any new admin endpoint goes under `/api/admin`, so you can't forget to protect it.
- The role is stored inside the token. So if an admin changes someone's role, it only takes effect after their token expires. That's acceptable for this app.

## Courts

| Method | Path                    | Who        | What                               |
|--------|-------------------------|------------|------------------------------------|
| GET    | `/api/courts`           | any user   | active courts only                 |
| GET    | `/api/admin/courts`     | admin      | all courts, including inactive     |
| POST   | `/api/admin/courts`     | admin      | create a court                     |
| PUT    | `/api/admin/courts/:id` | admin      | replace a court (incl. `isActive`) |

- **No delete, only deactivate.** There is no `DELETE` endpoint: to deactivate a court you send `PUT` with `isActive: false`. The database adds a second guard: a booking points at its court, so Postgres won't delete a court that has bookings. Booking history can't be lost.
- **PUT, not PATCH.** The edit form always sends every field anyway. That way create and edit share one validation function, and we never have to merge old and new values. `isActive` is required, so a request can't switch a court back on by accident.
- **Opening hours are whole hours** (`"08:00"`, not `"08:30"`), because the day is split into 1-hour slots. The API checks this, and so does a `CHECK` rule in the database.
- **Prices are in cents** (`2400` = €24.00). Whole numbers never have rounding errors, unlike decimals such as `0.1 + 0.2`.
- **Changing a court never changes existing bookings.**
  - Each booking saves its own total price when it's made, so a new hourly price only affects new bookings.
  - If a court is deactivated, or its opening hours change, existing bookings still count. Only new bookings must follow the new rules (an inactive court can't be booked). Another option was to block deactivation while a court has future bookings. We chose the simpler rule, which also never takes a booking away from a player.

## Time zone

The facility has one time zone, `Europe/Lisbon` (`FACILITY_TIMEZONE` in `src/config.ts`).
- Opening hours like `08:00–23:00` are local clock times at the facility.
- Bookings are stored as exact moments in time (`timestamptz`).
- To turn "Nov 24 at 18:00 at the facility" into an exact moment, we let Postgres do it: `(date + time) AT TIME ZONE 'Europe/Lisbon'`. This stays correct on the days when clocks move for summer time.
- "A day" (for example, the admin's daily view) always means a day at the facility, not a UTC day.

## No double bookings

Checking "is this slot free?" in code and then saving is **not** safe. Two requests can both check at the same moment, both see the slot as free, and both save.

So the database itself enforces the rule, with an **exclusion constraint** on the `bookings` table:

```sql
CONSTRAINT bookings_no_overlap EXCLUDE USING gist (
  court_id WITH =,
  tstzrange(start_at, end_at) WITH &&
) WHERE (status = 'confirmed')
```

In plain words: *no two confirmed bookings may have the same court **and** overlapping time ranges.* Postgres checks this on every insert, even when two inserts happen at the same instant. One of them succeeds and the other fails. Cancelled bookings are left out, so a cancelled slot can be booked again.

Another `CHECK` rule makes sure every booking lasts exactly 1 or 2 hours.

## Demo data

`backend/src/seed.ts` creates 3 users, 4 courts (one of them inactive) and 8 bookings. Booking dates are counted from today, so the demo always has past, today's and upcoming bookings. The demo also includes:
- a cancelled booking with a new booking on the same slot,
- a booking on the inactive court, to show its history is kept.

## Tests

The backend uses Node's built-in test runner (`node:test`), so there's no extra test library. Business rules are plain functions, so most of them can be tested without a database.
