# Database migration

Migration files: `packages/db/migrations/0001` to `0007`. The runner (`packages/db/src/migrate.ts`, invoked by the compose `migrate` service or `pnpm db:migrate`) applies files in name order inside one transaction each, records a checksum in `public.schema_migrations`, refuses to run a file whose checksum changed, and takes an advisory lock so two runners cannot overlap.

## Pending for this handoff

| File | Purpose | Type | Data touched |
| --- | --- | --- | --- |
| `0007_analytics_geo_city.sql` | `ALTER TABLE analytics.events ADD COLUMN city text` | Additive | None; new nullable column |

Migrations 0005 (demand intelligence) and 0006 (analytics channels) were part of earlier commits. If the server database has not had them yet, the runner applies them in order; both are additive (new tables, new nullable columns, one check constraint on a new column).

## Preconditions

1. Inventory recorded (`SERVER-INVENTORY-REQUIREMENTS.md`): PostgreSQL 16 with pgvector, current highest migration known.
2. Fresh backup taken within the same maintenance window: `infra/scripts/backup.sh /etc/bbcare/<env>.env` (database dump, storage archive, checksums). The deploy script takes one automatically when a previous image exists.
3. Disk headroom for the dump and for the partitioned `analytics.events` table (a text column on existing rows costs nothing until written).
4. For production: explicit owner approval for the deploy that carries the migration.

## Execution

Migrations are not run by hand. They run as the first step of the deploy (`infra/scripts/deploy.sh`), before web and worker start, through the `migrate` service. For a host install without Docker: `pnpm --filter @bbcare/db migrate` with `DATABASE_URL` pointing at the target database, as the same user the application uses.

Never run `reset` or `seed` against production. `reset` drops schemas; `seed` writes synthetic staff accounts and sample content.

## Schema verification

```sql
select filename, applied_at from public.schema_migrations order by filename;   -- 0007 present
select column_name from information_schema.columns
 where table_schema = 'analytics' and table_name = 'events' and column_name in ('country','region','city');  -- three rows
select count(*) from information_schema.columns
 where table_schema = 'analytics' and table_name = 'events' and column_name ~ 'ip|latitude|longitude';     -- 0
```

## Post-migration tests

1. `curl -s http://127.0.0.1:<port>/api/health/ready` returns `"status":"ready"` and `"migrations"` equal to the number of files (7).
2. Open Admin, Customer Analytics & Intelligence, Overview; "Refresh now" completes without error (it runs the rollup that reads the new column).
3. Send one synthetic page view from a browser and confirm it appears in Privacy & Tracking Settings counts within a minute.

## Rollback considerations

- A failed migration leaves the schema unchanged (transaction per file). Fix forward.
- The previous application image works with the new column (expand-then-contract policy), so an application rollback needs no schema change.
- Removing the column is only for a deliberate retreat: stop web and worker, `ALTER TABLE analytics.events DROP COLUMN city;`, delete the `0007` row from `public.schema_migrations`, deploy the previous image. Requires owner approval; it discards city data collected so far.
