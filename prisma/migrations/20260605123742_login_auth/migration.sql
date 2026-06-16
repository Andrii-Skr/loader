SET search_path TO "pdf_loader";

ALTER TABLE "users"
ADD COLUMN "login" TEXT;

UPDATE "users"
SET "login" = COALESCE(
  NULLIF(split_part(COALESCE("email", ''), '@', 1), ''),
  'user_' || left("id", 8)
)
WHERE "login" IS NULL;

ALTER TABLE "users"
ALTER COLUMN "login" SET NOT NULL;

ALTER TABLE "users"
ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "users_login_key" ON "users"("login");
