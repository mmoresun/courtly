// Runs the real Express app on a random port, so tests go through routing, auth, validation
// and the error handler exactly like a browser would. Uses Node's built-in fetch.
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before } from "node:test";
import { app } from "../app";
import { signToken, type Role } from "../auth";

let baseUrl = "";

/** Call at the top of a test file (after useTestDatabase). */
export function useTestServer(): void {
  let server: Server;
  before(async () => {
    server = app.listen(0);
    await once(server, "listening");
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
}

export function tokenFor(userId: number, role: Role = "user"): string {
  return signToken({ id: userId, role });
}

export async function api(
  method: string,
  path: string,
  { token, body }: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: any }> {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token && { authorization: `Bearer ${token}` }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}
