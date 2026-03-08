# Brooklyn Clone – Setup

This folder is a full copy of the app, pointed at **your own Supabase project** (e.g. Brooklyn). No code changes are required; you only add environment variables.

## 1. Add Supabase credentials

1. Copy the example env file:
   ```bash
   cp .env.example .env.local
   ```
2. Open `.env.local` and set:
   - **NEXT_PUBLIC_SUPABASE_URL** – Your Supabase project URL (e.g. `https://xxxxx.supabase.co`)
   - **NEXT_PUBLIC_SUPABASE_ANON_KEY** – Anon/public key from Supabase → Settings → API
   - **SUPABASE_SERVICE_ROLE_KEY** – Service role key from Supabase → Settings → API (keep secret)
   - **DATABASE_URL** – Postgres connection string from Supabase → Settings → Database → Connection string (URI, direct connection on port 5432)

## 2. Install and run the app

```bash
npm install
npm run dev
```

## 3. Create the database schema (first time only)

Your new Supabase project has an empty database. Apply the schema with Prisma:

```bash
npx prisma migrate deploy
```

Or, if you prefer to sync schema without migration history:

```bash
npx prisma db push
```

After that, the app is connected to your Brooklyn Supabase project.

## 4. Seed default vendor and essentials (first time)

To create a **default vendor** ("Brooklyn Diet"), app settings, a default client status ("Active"), and two placeholder clients:

```bash
npm run seed
```

If you see "Could not find the table 'public.vendors'", run `npx prisma migrate deploy` first (and ensure your network can reach the Supabase DB).

## Optional

- **Verify schema:** Run `npm run dump-db-schema` to dump the live schema to `docs/db-schema-dump.txt` (no Prisma runtime; uses `pg`).
- **Chrome extension / server-side automation:** If you use the app in `df ext and server/server-side-automation/`, add a `.env` there (see that folder’s `.env.example`) and set `EXTENSION_API_BASE_URL` to this app’s URL and `EXTENSION_API_KEY` to match the key you set in this app’s `.env.local`.
