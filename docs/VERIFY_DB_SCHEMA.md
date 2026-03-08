# Verifying the real database schema (without relying on Prisma)

The app uses **Supabase** for runtime access; Prisma is only used for migrations and is not the runtime client. To be certain what the live Postgres schema actually is:

## 1. Dump the live schema (recommended, no Prisma)

A script introspects the database directly via `pg` and writes the result to `docs/db-schema-dump.txt`:

```bash
npm run dump-db-schema
```

- **Requires:** `DATABASE_URL` in `.env.local` (use the **direct** connection string, port 5432; the script converts pooler port 6543 to 5432).
- **Output:** `docs/db-schema-dump.txt` (tables, columns, types, nullability, defaults, primary keys, indexes).
- **No Prisma** is used; this is the real schema as seen by Postgres.

Run this whenever you want to confirm what’s in the DB (e.g. after manual SQL changes or before a migration).

## 2. Compare with Prisma schema (optional)

If you want to check whether `prisma/schema.prisma` matches the live DB:

1. Run `npm run dump-db-schema` and open `docs/db-schema-dump.txt`.
2. Manually compare tables/columns/types in that file with `prisma/schema.prisma`.

If you’re okay using Prisma **once** as a read-only tool (no need to use it in the app):

- Run: `npx prisma db pull`
- That overwrites `prisma/schema.prisma` with whatever is in the DB. You can then diff that file against git to see what Prisma thought was there before, or save the result as e.g. `schema-from-db.prisma` for reference and revert `schema.prisma` if you don’t want to keep the overwrite.

## 3. Supabase Dashboard

In [Supabase](https://app.supabase.com) → your project → **Table Editor** or **SQL Editor** (e.g. `\d+ table_name` or querying `information_schema`) you can inspect tables and columns there as well.

---

**Summary:** Use `npm run dump-db-schema` to get a Prisma-independent, file-based snapshot of the current schema in `docs/db-schema-dump.txt`. That file is your source of truth for “what’s really in the DB.”
