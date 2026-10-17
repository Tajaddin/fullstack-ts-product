// Seeds the course list and, optionally, promotes an account to admin:
//   npm run seed
//   npm run seed -- --admin you@example.com
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { courses, users } from "./schema";
import { STARTER_COURSES } from "./starter-courses";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb(url, 2);
  const inserted = await db
    .insert(courses)
    .values(STARTER_COURSES.map((c) => ({ code: c.code, title: c.title, department: c.code.slice(0, 3) })))
    .onConflictDoNothing({ target: courses.code })
    .returning({ code: courses.code });
  console.log(`courses: ${inserted.length} inserted, ${STARTER_COURSES.length - inserted.length} already present`);

  const adminFlag = process.argv.indexOf("--admin");
  if (adminFlag !== -1) {
    const email = (process.argv[adminFlag + 1] ?? "").toLowerCase();
    if (!email) throw new Error("--admin needs an e-mail");
    const [u] = await db
      .insert(users)
      .values({ email, role: "admin", emailVerified: new Date() })
      .onConflictDoUpdate({ target: users.email, set: { role: "admin" } })
      .returning({ id: users.id });
    const [check] = await db.select({ role: users.role }).from(users).where(eq(users.id, u.id));
    console.log(`admin: ${email} (${check.role})`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
