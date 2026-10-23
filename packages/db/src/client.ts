import postgres from "postgres";

export type Sql = postgres.Sql;
export type TxSql = postgres.TransactionSql;

export interface DbOptions {
  url: string;
  max?: number;
  /** Application name visible in pg_stat_activity. */
  appName?: string;
}

export function createSql(opts: DbOptions): Sql {
  return postgres(opts.url, {
    max: opts.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
    onnotice: () => {},
    connection: { application_name: opts.appName ?? "bbcare" },
    transform: { undefined: null },
  });
}

/** Convert a postgres.js bigint result to number (counts are well below 2^53). */
export function num(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "string") return Number(value);
  return typeof value === "number" ? value : 0;
}
