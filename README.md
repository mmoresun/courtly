# Courtly

Courtly is a sports court booking service. A user picks a court and a date, sees the free slots, books one or two consecutive hours, and can cancel a booking up to 2 hours before it starts. An admin adds, edits, deactivates and reactivates courts, and sees all bookings for a day along with the expected revenue.

## How to run

You need Docker installed. Clone the repository and run `docker compose up` in its folder: the images are built, migrations are applied, demo data is seeded, and everything starts. The frontend is available at http://localhost:5173. Log in as a user or as the admin. Clicking a name on the login page fills in the form.

Users: `alice@courtly.test`, `bob@courtly.test`. Admin: `admin@courtly.test`. The password for all of them is `courtly123`.

## Tests

Backend tests run inside the backend container against a separate test database, so the demo data stays untouched. With the app running (`docker compose up`), run:

```bash
docker compose exec backend npm test
```

## Stack

**React + Vite, not Next.** The app doesn't need SEO or SSR: it sits behind a login. The brief requires a separate backend anyway, so with Next there would be two servers. Downside: I write routing and data loading myself, and if public pages for search engines are ever needed, SSR will have to be added.

**Express, not Nest.** Express is enough for a small project, while Nest would bring more boilerplate. Downside: I organize structure, validation and error handling myself. On a large project with a team, Nest would be more convenient.

**PostgreSQL.** It has the exclusion constraint (`EXCLUDE USING gist`), which forbids overlapping bookings at the database level. Downside: this is Postgres-specific, so moving to another database would require a different way to enforce it.

## How double booking is prevented

The `bookings` table has the `bookings_no_overlap` constraint (`EXCLUDE USING gist`): a court cannot have two active (`confirmed`) bookings with overlapping times. The database itself checks it on every write, so it also works for simultaneous requests: if two users book the same time, the database lets only one through and the other gets `409`. Cancelled bookings don't take part in the check, so their time can be booked again. The constraint lives in `backend/migrations/1794822350605_init-schema.sql`. The tests are in `backend/src/bookings/bookings.create.test.ts`. One of them sends 10 bookings for the same slot at the same moment and checks that exactly one wins and the rest get `409`. To run only the double-booking tests:

```bash
docker compose exec backend sh -c 'DATABASE_URL=$TEST_DATABASE_URL npx tsx --test --test-global-setup=src/test/global-setup.mts --test-name-pattern="no double bookings" src/bookings/bookings.create.test.ts'
```

## What I'd do with more time

- **SSE for slots.** Right now, to see that a slot has been taken, you have to reload the page or get an error when booking.
- **Cancellation by the admin.** Useful when a user can't cancel a booking themselves (for example, they lost access and called the venue) or booked a court and didn't show up. The admin could also cancel later than 2 hours before the start.
- **Payment.** Venues like this almost always need it. It would require a `pending` status: the booking holds the slot while payment is in progress and is released if payment doesn't arrive.
- **Frontend and e2e tests.** Right now there are only backend tests. An e2e test would check the whole flow "log in → book → cancel" in a browser.
- **CI on every commit.** Tests and type checks would run automatically, catching breakages before they reach main.
