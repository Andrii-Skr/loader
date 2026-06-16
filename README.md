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
# loader
