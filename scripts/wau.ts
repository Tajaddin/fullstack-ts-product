// Weekly and daily active users from the daily_active table. Prints JSON; --write puts a line in README.md
// between the WAU markers so the number in the README always comes from this script.
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1 });
  try {
    const [wau] = await sql<{ n: string }[]>`select count(distinct user_id) as n from daily_active where day >= current_date - 7`;
    const days = await sql<{ day: string; n: string }[]>`
      select day::text, count(*) as n from daily_active where day >= current_date - 7 group by day order by day`;
    const [accounts] = await sql<{ n: string }[]>`select count(*) as n from users`;
    const report = {
      as_of: new Date().toISOString().slice(0, 10),
      weekly_active_users: Number(wau.n),
      accounts: Number(accounts.n),
      daily: days.map((d) => ({ day: d.day, active: Number(d.n) })),
      method: "distinct users with a daily_active row in the last 7 days; one row per user per UTC day they loaded a page while signed in",
    };
    console.log(JSON.stringify(report, null, 2));
    if (process.argv.includes("--write")) {
      const readme = path.resolve(process.cwd(), "README.md");
      const text = fs.readFileSync(readme, "utf8");
      const start = "<!-- WAU -->";
      const end = "<!-- /WAU -->";
      const a = text.indexOf(start) + start.length;
      const b = text.indexOf(end);
      if (a < start.length || b < 0) throw new Error("README.md has no WAU markers");
      const line = `\nWeekly active users as of ${report.as_of}: **${report.weekly_active_users}** (${report.accounts} accounts). ${report.method}.\n`;
      fs.writeFileSync(readme, text.slice(0, a) + line + text.slice(b));
      console.log("wrote README.md");
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
