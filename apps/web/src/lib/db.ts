import "server-only";
import { createSql, type Sql } from "@bbcare/db";
import { env } from "./env";

const globalForDb = globalThis as unknown as { __bbcareSql?: Sql };

/** Shared connection pool (one per server process, reused across hot reloads). */
export function db(): Sql {
  if (!globalForDb.__bbcareSql) {
    globalForDb.__bbcareSql = createSql({ url: env().DATABASE_URL, max: 10, appName: "bbcare-web" });
  }
  return globalForDb.__bbcareSql;
}
