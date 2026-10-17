import path from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { RedisContainer, type StartedRedisContainer } from "@testcontainers/redis";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { GenericContainer, Wait, type StartedTestContainer } from "testcontainers";
import { createDb, type Db } from "@/db/client";

export async function startPostgres(): Promise<{ container: StartedPostgreSqlContainer; db: Db; url: string }> {
  const container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const url = container.getConnectionUri();
  const db = createDb(url, 4);
  await migrate(db, { migrationsFolder: path.resolve(__dirname, "../../drizzle") });
  return { container, db, url };
}

export async function startRedis(): Promise<{ container: StartedRedisContainer; url: string }> {
  const container = await new RedisContainer("redis:7-alpine").start();
  return { container, url: container.getConnectionUrl() };
}

export async function startMailpit(): Promise<{ container: StartedTestContainer; smtpUrl: string; apiUrl: string }> {
  const container = await new GenericContainer("axllent/mailpit:v1.27")
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forHttp("/api/v1/info", 8025))
    .start();
  return {
    container,
    smtpUrl: `smtp://${container.getHost()}:${container.getMappedPort(1025)}`,
    apiUrl: `http://${container.getHost()}:${container.getMappedPort(8025)}`,
  };
}
