import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStatus } from "@/generated/prisma/client";

const documentFindManyMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findMany: documentFindManyMock } },
}));

import { getOrphanedInvoiceVersionGroups } from "@/lib/documents/queries";

const version = ({
  id,
  documentNumber,
  isCurrent,
  extractionStatus = DocumentStatus.PROCESSED,
}: {
  id: number;
  documentNumber: string;
  isCurrent: boolean;
  extractionStatus?: DocumentStatus;
}) => ({
  id,
  documentTypeId: 2,
  documentContour: "UA",
  documentNumber,
  documentDate: new Date("2026-04-10T00:00:00.000Z"),
  supplierId: 1,
  sourceFileName: `invoice-${id}.pdf`,
  revision: id,
  isCurrent,
  extractionStatus,
  totalAmount: null,
  currency: "UAH",
  supplier: { name: "Supplier" },
  recipient: { name: "Recipient" },
});

describe("getOrphanedInvoiceVersionGroups", () => {
  beforeEach(() => documentFindManyMock.mockReset());

  it("keeps restorable history when its current invoice was deleted", async () => {
    documentFindManyMock.mockResolvedValue([
      version({ id: 3, documentNumber: "10", isCurrent: false }),
      version({
        id: 2,
        documentNumber: "10",
        isCurrent: false,
        extractionStatus: DocumentStatus.FAILED,
      }),
      version({ id: 5, documentNumber: "11", isCurrent: true }),
      version({ id: 4, documentNumber: "11", isCurrent: false }),
    ]);

    const groups = await getOrphanedInvoiceVersionGroups();

    expect(groups).toHaveLength(1);
    expect(groups[0]?.versions.map(({ id }) => id)).toEqual([3]);
  });
});
