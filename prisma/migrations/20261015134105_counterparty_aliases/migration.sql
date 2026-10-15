-- CreateTable
CREATE TABLE "supplier_aliases" (
    "id" SERIAL NOT NULL,
    "contour" "DocumentContour" NOT NULL,
    "raw_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "supplier_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipient_aliases" (
    "id" SERIAL NOT NULL,
    "contour" "DocumentContour" NOT NULL,
    "raw_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "source_supplier_tax_id" TEXT NOT NULL DEFAULT '',
    "recipient_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipient_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_aliases_supplier_id_idx" ON "supplier_aliases"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_aliases_contour_normalized_name_key" ON "supplier_aliases"("contour", "normalized_name");

-- CreateIndex
CREATE INDEX "recipient_aliases_recipient_id_idx" ON "recipient_aliases"("recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "recipient_aliases_contour_normalized_name_source_supplier_t_key" ON "recipient_aliases"("contour", "normalized_name", "source_supplier_tax_id");

-- AddForeignKey
ALTER TABLE "supplier_aliases" ADD CONSTRAINT "supplier_aliases_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_aliases" ADD CONSTRAINT "recipient_aliases_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
