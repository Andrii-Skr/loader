-- CreateTable
CREATE TABLE "collection_presets" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "source_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_presets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_preset_editions" (
    "id" SERIAL NOT NULL,
    "preset_id" INTEGER NOT NULL,
    "external_edition_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "collection_preset_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_preset_aliases" (
    "id" SERIAL NOT NULL,
    "preset_id" INTEGER NOT NULL,
    "source_code" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "collection_preset_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_presets_source_code_normalized_name_key" ON "collection_presets"("source_code", "normalized_name");

-- CreateIndex
CREATE UNIQUE INDEX "collection_preset_editions_preset_id_external_edition_id_key" ON "collection_preset_editions"("preset_id", "external_edition_id");

-- CreateIndex
CREATE INDEX "collection_preset_aliases_preset_id_idx" ON "collection_preset_aliases"("preset_id");

-- CreateIndex
CREATE UNIQUE INDEX "collection_preset_aliases_source_code_key_key" ON "collection_preset_aliases"("source_code", "key");

-- AddForeignKey
ALTER TABLE "collection_preset_editions" ADD CONSTRAINT "collection_preset_editions_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "collection_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_preset_aliases" ADD CONSTRAINT "collection_preset_aliases_preset_id_fkey" FOREIGN KEY ("preset_id") REFERENCES "collection_presets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
