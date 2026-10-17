import { encode } from "next-auth/jwt";
import type { BrowserContext } from "@playwright/test";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL ?? "postgres://coursemates:coursemates@localhost:5436/coursemates";
const secret = process.env.AUTH_SECRET ?? "";
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3100";

export interface TestUser {
  id: string;
  email: string;
  name: string;
  role: "member" | "moderator" | "admin";
}

/**
 * Creates (or reuses) a user row and signs the browser in by minting the same encrypted session cookie
 * Auth.js would issue. Works against a production build, where the dev login is off. Needs AUTH_SECRET.
 */
export async function signInAs(context: BrowserContext, user: Omit<TestUser, "id">): Promise<TestUser> {
  if (!secret) throw new Error("AUTH_SECRET is required for e2e sign-in");
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [row] = await sql<{ id: string }[]>`
      insert into users (id, email, name, role, email_verified) values (gen_random_uuid()::text, ${user.email}, ${user.name}, ${user.role}, now())
      on conflict (email) do update set role = excluded.role, name = excluded.name
      returning id`;
    const secure = baseURL.startsWith("https://");
    const cookieName = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
    const token = await encode({ token: { sub: row.id, email: user.email, name: user.name }, secret, salt: cookieName, maxAge: 3600 });
    const url = new URL(baseURL);
    await context.addCookies([
      { name: cookieName, value: token, domain: url.hostname, path: "/", httpOnly: true, secure, sameSite: "Lax" },
    ]);
    return { id: row.id, ...user };
  } finally {
    await sql.end();
  }
}

export async function cleanupUsers(emails: string[]): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    await sql`delete from users where email = any(${emails})`;
  } finally {
    await sql.end();
  }
}

export const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
