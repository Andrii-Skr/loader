import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStatus } from "@/generated/prisma/client";

const parserMocks = vi.hoisted(() => ({
  parse: vi.fn(),
  parsePublicationIssueDescription: vi.fn(),
  getInvoiceParserByContour: vi.fn(),
}));

const prismaState = vi.hoisted(() => ({
  tx: createTransactionMock(),
}));

vi.mock("@/lib/pdf/parser", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/parser")>("@/lib/pdf/parser");

  return {
    ...actual,
    getInvoiceParserByContour: parserMocks.getInvoiceParserByContour,
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: typeof prismaState.tx) => unknown) =>
      callback(prismaState.tx),
    ),
  },
}));

import { ingestVatInvoice } from "@/lib/pdf/persist";

describe("ingestVatInvoice", () => {
  beforeEach(() => {
    parserMocks.parse.mockReset();
    parserMocks.parsePublicationIssueDescription.mockReset();
    parserMocks.getInvoiceParserByContour.mockReset();
    prismaState.tx = createTransactionMock();
    parserMocks.getInvoiceParserByContour.mockReturnValue({
      contour: "UA",
      parserVersion: "vat-invoice-ua-v1",
      lookupLocale: "uk-UA",
      parse: parserMocks.parse,
      parsePublicationIssueDescription: parserMocks.parsePublicationIssueDescription,
    });
  });

  it("creates publication, issue number and publication issue for parsed line items", async () => {
    parserMocks.parse.mockReturnValue(
      createParsedInvoice({
        lineItems: [createLineItem('ж-л "Філворди.Спецвипуск" №4/саморобка/')],
      }),
    );
    parserMocks.parsePublicationIssueDescription.mockReturnValue({
      publicationName: "Філворди.Спецвипуск",
      rawIssueNumber: "4/саморобка/",
      canonicalIssueNumber: "04-26 (саморобка)",
    });

    const document = await ingestVatInvoice({
      documentId: 101,
      contour: "UA",
      rawText: "raw text",
    });

    const createInput = getCreatedLineItem(0);

    expect(createInput).toBeDefined();
    expect(prismaState.tx.store.publications.size).toBe(1);
    expect(prismaState.tx.store.issueNumbers.size).toBe(1);
    expect(prismaState.tx.store.publicationIssues.size).toBe(1);
    expect(createInput?.publicationIssueId).toBe(1);
    expect(document.reviewRequired).toBe(false);
    expect(document.extractionStatus).toBe(DocumentStatus.PROCESSED);
    expect(document.documentContour).toBe("UA");
    expect(document.parserVersion).toBe("vat-invoice-ua-v1");
  });

  it("reuses the same normalized publication issue across uploads", async () => {
    parserMocks.parse.mockReturnValue(
      createParsedInvoice({
        lineItems: [createLineItem('ж-л "Філворди.Спецвипуск" №4/саморобка/')],
      }),
    );
    parserMocks.parsePublicationIssueDescription.mockReturnValue({
      publicationName: "Філворди.Спецвипуск",
      rawIssueNumber: "4/саморобка/",
      canonicalIssueNumber: "04-26 (саморобка)",
    });

    await ingestVatInvoice({
      documentId: 201,
      contour: "UA",
      rawText: "first raw text",
    });

    const firstPublicationIssueId = getCreatedLineItem(0)?.publicationIssueId;

    await ingestVatInvoice({
      documentId: 202,
      contour: "UA",
      rawText: "second raw text",
    });

    const secondPublicationIssueId = getCreatedLineItem(1)?.publicationIssueId;

    expect(prismaState.tx.store.publications.size).toBe(1);
    expect(prismaState.tx.store.issueNumbers.size).toBe(1);
    expect(prismaState.tx.store.publicationIssues.size).toBe(1);
    expect(secondPublicationIssueId).toBe(firstPublicationIssueId);
  });

  it("deduplicates raw and canonical issue variants into one issue number", async () => {
    parserMocks.parse.mockReturnValue(
      createParsedInvoice({
        lineItems: [createLineItem('ж-л "Філворди" №4')],
      }),
    );
    parserMocks.parsePublicationIssueDescription
      .mockReturnValueOnce({
        publicationName: "Філворди",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      })
      .mockReturnValueOnce({
        publicationName: "Філворди",
        rawIssueNumber: "04-26",
        canonicalIssueNumber: "04-26",
      });

    await ingestVatInvoice({
      documentId: 211,
      contour: "UA",
      rawText: "first raw text",
    });

    await ingestVatInvoice({
      documentId: 212,
      contour: "UA",
      rawText: "second raw text",
    });

    expect(prismaState.tx.store.issueNumbers.size).toBe(1);
    expect(Array.from(prismaState.tx.store.issueNumbers.values())).toEqual([
      expect.objectContaining({
        rawValue: "4",
        canonicalValue: "04-26",
        normalizedValue: "04-26",
      }),
    ]);
  });

  it("marks document for review when publication issue parsing fails", async () => {
    parserMocks.parse.mockReturnValue(
      createParsedInvoice({
        lineItems: [createLineItem("Послуги з пакування")],
      }),
    );
    parserMocks.parsePublicationIssueDescription.mockReturnValue(null);

    const document = await ingestVatInvoice({
      documentId: 301,
      contour: "UA",
      rawText: "raw text",
    });

    const createInput = getCreatedLineItem(0);

    expect(createInput).toBeDefined();
    expect(createInput?.publicationIssueId).toBeNull();
    expect(document.reviewRequired).toBe(true);
    expect(document.extractionStatus).toBe(DocumentStatus.NEEDS_REVIEW);
  });

  it("keeps parsed publication issues but still marks review when only some rows fail", async () => {
    parserMocks.parse.mockReturnValue(
      createParsedInvoice({
        lineItems: [
          createLineItem('ж-л "Філворди" №4'),
          {
            ...createLineItem("Послуги з пакування"),
            lineNo: 2,
          },
        ],
      }),
    );
    parserMocks.parsePublicationIssueDescription
      .mockReturnValueOnce({
        publicationName: "Філворди",
        rawIssueNumber: "4",
        canonicalIssueNumber: "04-26",
      })
      .mockReturnValueOnce(null);

    const document = await ingestVatInvoice({
      documentId: 401,
      contour: "UA",
      rawText: "raw text",
    });

    const firstCreateInput = getCreatedLineItem(0, 0);
    const secondCreateInput = getCreatedLineItem(0, 1);

    expect(firstCreateInput?.publicationIssueId).toBe(1);
    expect(secondCreateInput?.publicationIssueId).toBeNull();
    expect(document.reviewRequired).toBe(true);
    expect(document.extractionStatus).toBe(DocumentStatus.NEEDS_REVIEW);
  });

  it("uses contour-specific parser metadata for RU uploads", async () => {
    parserMocks.getInvoiceParserByContour.mockReturnValue({
      contour: "RU",
      parserVersion: "vat-invoice-ru-v1",
      lookupLocale: "ru-RU",
      parse: parserMocks.parse,
      parsePublicationIssueDescription: parserMocks.parsePublicationIssueDescription,
    });
    parserMocks.parse.mockReturnValue(
      createParsedInvoice({
        documentType: "Счет-фактура",
        supplierKpp: "770101001",
        recipientKpp: "770201001",
        lineItems: [createLineItem('журнал "Сканворды" №4')],
      }),
    );
    parserMocks.parsePublicationIssueDescription.mockReturnValue({
      publicationName: "Сканворды",
      rawIssueNumber: "4",
      canonicalIssueNumber: "04-26",
    });

    const document = await ingestVatInvoice({
      documentId: 501,
      contour: "RU",
      rawText: "raw text",
    });

    expect(prismaState.tx.supplier.upsert).toHaveBeenCalledWith({
      where: { taxId: "123456789012/770101001" },
      update: { name: 'ТОВ "Постачальник"', kpp: "770101001" },
      create: {
        name: 'ТОВ "Постачальник"',
        taxId: "123456789012/770101001",
        kpp: "770101001",
      },
    });
    expect(document.documentContour).toBe("RU");
    expect(document.parserVersion).toBe("vat-invoice-ru-v1");
  });
});

function createParsedInvoice({
  documentType = "Податкова накладна",
  supplierTaxId = "123456789012",
  supplierKpp = null,
  recipientTaxId = "210987654321",
  recipientKpp = null,
  lineItems,
}: {
  documentType?: string;
  supplierTaxId?: string;
  supplierKpp?: string | null;
  recipientTaxId?: string;
  recipientKpp?: string | null;
  lineItems: Array<ReturnType<typeof createLineItem>>;
}) {
  return {
    documentType,
    documentNumber: "18",
    documentDate: "10.04.2026",
    supplier: {
      name: 'ТОВ "Постачальник"',
      taxId: supplierTaxId,
      kpp: supplierKpp,
    },
    recipient: {
      name: 'ТОВ "Отримувач"',
      taxId: recipientTaxId,
      kpp: recipientKpp,
    },
    totalAmount: "100.00",
    vatAmount: "20.00",
    baseAmount: "80.00",
    lineItems,
    rawText: "raw text",
    reviewRequired: false,
  };
}

function createLineItem(description: string) {
  return {
    lineNo: 1,
    description,
    sourceRowCode: null,
    serviceCode: "18.12",
    itemTypeCode: null,
    unitName: "шт",
    unitCode: "2009",
    quantity: "1",
    unitPrice: "10.00",
    vatRate: "20",
    benefitCode: null,
    lineBaseAmount: "10.00",
    lineVatAmount: "2.00",
    exciseAmount: null,
    lineTotalAmount: null,
    countryCode: null,
    countryName: null,
    customsDeclarationNumber: null,
    rawRowText: description,
  };
}

function createTransactionMock() {
  const store = {
    publications: new Map<string, { id: number; displayName: string; normalizedName: string }>(),
    issueNumbers: new Map<
      string,
      { id: number; rawValue: string; canonicalValue: string; normalizedValue: string }
    >(),
    publicationIssues: new Map<
      string,
      { id: number; publicationId: number; issueNumberId: number }
    >(),
  };

  let publicationId = 1;
  let issueNumberId = 1;
  let publicationIssueId = 1;

  return {
    store,
    supplier: {
      upsert: vi.fn(
        async ({ create }: { create: { name: string; taxId: string; kpp: string | null } }) => ({
          id: 1,
          ...create,
        }),
      ),
    },
    recipient: {
      upsert: vi.fn(
        async ({ create }: { create: { name: string; taxId: string; kpp: string | null } }) => ({
          id: 2,
          ...create,
        }),
      ),
    },
    specialDocument: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
    },
    publication: {
      upsert: vi.fn(
        async ({
          where,
          update,
          create,
        }: {
          where: { normalizedName: string };
          update: { displayName: string };
          create: { displayName: string; normalizedName: string };
        }) => {
          const existing = store.publications.get(where.normalizedName);

          if (existing) {
            const updated = { ...existing, displayName: update.displayName };
            store.publications.set(where.normalizedName, updated);
            return updated;
          }

          const created = { id: publicationId++, ...create };
          store.publications.set(where.normalizedName, created);
          return created;
        },
      ),
    },
    issueNumber: {
      upsert: vi.fn(
        async ({
          where,
          update,
          create,
        }: {
          where: { normalizedValue: string };
          update: { canonicalValue: string };
          create: { rawValue: string; canonicalValue: string; normalizedValue: string };
        }) => {
          const existing = store.issueNumbers.get(where.normalizedValue);

          if (existing) {
            const updated = { ...existing, canonicalValue: update.canonicalValue };
            store.issueNumbers.set(where.normalizedValue, updated);
            return updated;
          }

          const created = { id: issueNumberId++, ...create };
          store.issueNumbers.set(where.normalizedValue, created);
          return created;
        },
      ),
    },
    publicationIssue: {
      upsert: vi.fn(
        async ({
          where,
          create,
        }: {
          where: {
            publicationId_issueNumberId: {
              publicationId: number;
              issueNumberId: number;
            };
          };
          create: { publicationId: number; issueNumberId: number };
        }) => {
          const key = `${where.publicationId_issueNumberId.publicationId}:${where.publicationId_issueNumberId.issueNumberId}`;
          const existing = store.publicationIssues.get(key);

          if (existing) {
            return existing;
          }

          const createdRecord = { id: publicationIssueId++, ...create };
          store.publicationIssues.set(key, createdRecord);
          return createdRecord;
        },
      ),
    },
    document: {
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 999,
        ...data,
      })),
    },
  };
}

function getCreatedLineItem(callIndex: number, lineIndex = 0) {
  const updateCall = prismaState.tx.document.update.mock.calls[callIndex]?.[0] as
    | {
        data?: {
          lineItems?: {
            create?: Array<{
              publicationIssueId: number | null;
            }>;
          };
        };
      }
    | undefined;

  return updateCall?.data?.lineItems?.create?.[lineIndex];
}
