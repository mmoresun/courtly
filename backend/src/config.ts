function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

// Courts' opening hours are local wall-clock times of the facility; bookings are absolute instants.
export const FACILITY_TIMEZONE = "Europe/Lisbon";

export const config = {
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  port: Number(process.env.PORT ?? 3000),
};
