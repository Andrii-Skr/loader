# Zenit Loader

Internal `Next.js` application scaffold for loading Ukrainian invoice PDFs into
an existing `PostgreSQL` database.

## Stack

- `Next.js` App Router
- `NextAuth` credentials auth
- `Prisma 7`
- `Tailwind CSS`
- `shadcn/ui`
- `Biome`
- `Vitest`

## Key Paths

- [auth.ts](/Users/macdark/Documents/js/loader/auth.ts)
- [prisma/schema.prisma](/Users/macdark/Documents/js/loader/prisma/schema.prisma)
- [src/app/(app)/dashboard/page.tsx](/Users/macdark/Documents/js/loader/src/app/(app)/dashboard/page.tsx)
- [src/lib/pdf/parser.ts](/Users/macdark/Documents/js/loader/src/lib/pdf/parser.ts)
- [src/lib/pdf/persist.ts](/Users/macdark/Documents/js/loader/src/lib/pdf/persist.ts)

## Current State

- Auth and protected dashboard scaffolded.
- Prisma models include users, sessions, counterparties, documents, and line items.
- Upload flow stores a PDF and can parse when extracted text is provided.
- Upload flow now tries automatic PDF text extraction via `unpdf`.
- Local runtime config is expected in `.env.local`.
- Prisma CLI is configured via `prisma.config.ts` and generates the client into `src/generated/prisma`.

## Docker production deployment

Docker runs only the application. PostgreSQL remains an external dependency and is never created by
Compose. The container port is published on host `127.0.0.1` so a reverse proxy can provide the
public HTTPS endpoint.

1. Create the runtime environment file and replace every placeholder with production values:

   ```bash
   cp .env.docker.example .env.docker
   ```

   Set `DATABASE_URL` to the external database hostname or IP address. Do not use `127.0.0.1` or
   `localhost`: from inside the container those addresses refer to the container itself. Include its
   required TLS option (for example, `sslmode=require`) in the connection URL. Do not commit
   `.env.docker`.

2. Apply schema migrations explicitly before the application update:

   ```bash
   docker compose --env-file .env.docker --profile migrate run --rm migrate
   ```

3. Build and start the application:

   ```bash
   docker compose --env-file .env.docker up -d --build app
   ```

Uploaded PDFs are stored in the `uploads` named Docker volume and survive container recreation.
The `/api/health` endpoint reports ready only when the primary PostgreSQL connection succeeds.
Configure the reverse proxy to forward the public HTTPS hostname to `http://127.0.0.1:3000`.
# loader
