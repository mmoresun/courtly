import { Router, type Request, type RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config, FACILITY_TIMEZONE } from "./config";
import { pool } from "./db";
import { facilityNow } from "./bookings/bookings.queries";
import { HttpError } from "./errors";

export type Role = "user" | "admin";

export interface AuthUser {
  id: number;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser; // set by requireAuth
    }
  }
}

const TOKEN_TTL = "8h";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    throw new HttpError(400, "Email and password are required");
  }

  const { rows } = await pool.query<{ id: number; name: string; role: Role; password_hash: string }>(
    "SELECT id, name, role, password_hash FROM users WHERE email = $1",
    [email.trim().toLowerCase()],
  );
  const user = rows[0];
  // Same answer for unknown email and wrong password: don't reveal which emails exist.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  res.json({ token: signToken(user), user: { id: user.id, name: user.name, role: user.role } });
});

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role }, config.jwtSecret, { subject: String(user.id), expiresIn: TOKEN_TTL });
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) throw new HttpError(401, "Authentication required");

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
  req.user = { id: Number(payload.sub), role: payload.role };
  next();
};

export function requireRole(role: Role): RequestHandler {
  return (req, _res, next) => {
    if (req.user?.role !== role) throw new HttpError(403, "Forbidden");
    next();
  };
}

/** For handlers mounted behind requireAuth. */
export function currentUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, "Authentication required");
  return req.user;
}

/**
 * GET /api/me (behind requireAuth): who am I, and what day is it at the facility.
 * The frontend calls it on start: it checks the stored token (401 → back to login) and
 * gets the facility's "today" to preselect, instead of the browser's own date,
 * and the facility's time zone for the clock in the header.
 */
export const meHandler: RequestHandler = async (req, res) => {
  const { id } = currentUser(req);
  const { rows } = await pool.query<{ id: number; name: string; role: Role }>(
    "SELECT id, name, role FROM users WHERE id = $1",
    [id],
  );
  if (!rows[0]) throw new HttpError(401, "User no longer exists");
  res.json({ user: rows[0], facilityToday: (await facilityNow()).date, facilityTimeZone: FACILITY_TIMEZONE });
};
