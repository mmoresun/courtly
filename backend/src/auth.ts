import { Router, type Request, type RequestHandler } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config";
import { pool } from "./db";
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
    throw new HttpError(400, "email and password are required");
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

  const token = jwt.sign({ role: user.role }, config.jwtSecret, {
    subject: String(user.id),
    expiresIn: TOKEN_TTL,
  });
  res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
});

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
