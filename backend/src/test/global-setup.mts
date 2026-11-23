// Runs once before all test files (node --test-global-setup).
// Creates the test database if needed and brings its schema up to date.
// Node loads this file directly (not through tsx), so it must not import local files.
import { Client } from "pg";
import { runner } from "node-pg-migrate";

/** Safety net: never touch a database whose name doesn't end with "_test". Returns the name. */
export function assertTestDatabase(url: URL): string {
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run tests against database "${dbName}": its name must end with "_test"`);
  }
  return dbName;
}

export async function globalSetup(): Promise<void> {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const dbName = assertTestDatabase(url);

  // CREATE DATABASE can't run inside the database itself, so connect to the default one.
  const serverUrl = new URL(url);
  serverUrl.pathname = "/postgres";
  const client = new Client({ connectionString: serverUrl.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!rowCount) await client.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await client.end();
  }

  await runner({
    databaseUrl: url.toString(),
    dir: "migrations",
    migrationsTable: "pgmigrations",
    direction: "up",
    log: () => {},
  });
}
