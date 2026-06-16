import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentStatus } from "@/generated/prisma/client";

const parserMocks = vi.hoisted(() => ({
  parseVatInvoiceUaV1: vi.fn(),
  parsePublicationIssueDescription: vi.fn(),
}));

const prismaState = vi.hoisted(() => ({
  tx: createTransactionMock(),
}));

vi.mock("@/lib/pdf/parser", async () => {
  const actual = await vi.importActual<typeof import("@/lib/pdf/parser")>("@/lib/pdf/parser");

  return {
    ...actual,
    parseVatInvoiceUaV1: parserMocks.parseVatInvoiceUaV1,
    parsePublicationIssueDescription: parserMocks.parsePublicationIssueDescription,
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
    parserMocks.parseVatInvoiceUaV1.mockReset();
    parserMocks.parsePublicationIssueDescription.mockReset();
    prismaState.tx = createTransactionMock();
  });

  it("creates publication, issue number and publication issue for parsed line items", async () => {
    parserMocks.parseVatInvoiceUaV1.mockReturnValue(
      createParsedInvoice({
        lineItems: [createLineItem('ж-л "Філворди.Спецвипуск" №4/саморобка/')],
      }),
    );
    parserMocks.parsePublicationIssueDescription.mockReturnValue({
      publicationName: "Філворди.Спецвипуск",
      issueNumber: "4/саморобка/",
    });

    const document = await ingestVatInvoice({
      documentId: 101,
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
  });

  it("reuses the same normalized publication issue across uploads", async () => {
    parserMocks.parseVatInvoiceUaV1.mockReturnValue(
      createParsedInvoice({
        lineItems: [createLineItem('ж-л "Філворди.Спецвипуск" №4/саморобка/')],
      }),
    );
    parserMocks.parsePublicationIssueDescription.mockReturnValue({
      publicationName: "Філворди.Спецвипуск",
      issueNumber: "4/саморобка/",
    });

    await ingestVatInvoice({
      documentId: 201,
      rawText: "first raw text",
    });

    const firstPublicationIssueId = getCreatedLineItem(0)?.publicationIssueId;

    await ingestVatInvoice({
      documentId: 202,
      rawText: "second raw text",
    });

    const secondPublicationIssueId = getCreatedLineItem(1)?.publicationIssueId;

    expect(prismaState.tx.store.publications.size).toBe(1);
    expect(prismaState.tx.store.issueNumbers.size).toBe(1);
    expect(prismaState.tx.store.publicationIssues.size).toBe(1);
    expect(secondPublicationIssueId).toBe(firstPublicationIssueId);
  });

  it("marks document for review when publication issue parsing fails", async () => {
    parserMocks.parseVatInvoiceUaV1.mockReturnValue(
      createParsedInvoice({
        lineItems: [createLineItem("Послуги з пакування")],
      }),
    );
    parserMocks.parsePublicationIssueDescription.mockReturnValue(null);

    const document = await ingestVatInvoice({
      documentId: 301,
      rawText: "raw text",
    });

    const createInput = getCreatedLineItem(0);

    expect(createInput).toBeDefined();
    expect(createInput?.publicationIssueId).toBeNull();
    expect(document.reviewRequired).toBe(true);
    expect(document.extractionStatus).toBe(DocumentStatus.NEEDS_REVIEW);
  });

  it("keeps parsed publication issues but still marks review when only some rows fail", async () => {
    parserMocks.parseVatInvoiceUaV1.mockReturnValue(
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
        issueNumber: "4",
      })
      .mockReturnValueOnce(null);

    const document = await ingestVatInvoice({
      documentId: 401,
      rawText: "raw text",
    });

    const firstCreateInput = getCreatedLineItem(0, 0);
    const secondCreateInput = getCreatedLineItem(0, 1);

    expect(firstCreateInput?.publicationIssueId).toBe(1);
    expect(secondCreateInput?.publicationIssueId).toBeNull();
    expect(document.reviewRequired).toBe(true);
    expect(document.extractionStatus).toBe(DocumentStatus.NEEDS_REVIEW);
  });
});

function createParsedInvoice({
  lineItems,
}: {
  lineItems: Array<ReturnType<typeof createLineItem>>;
}) {
  return {
    documentType: "Податкова накладна",
    documentNumber: "18",
    documentDate: "10.04.2026",
    supplier: {
      name: 'ТОВ "Постачальник"',
      taxId: "123456789012",
    },
    recipient: {
      name: 'ТОВ "Отримувач"',
      taxId: "210987654321",
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
    serviceCode: "18.12",
    unitName: "шт",
    unitCode: "2009",
    quantity: "1",
    unitPrice: "10.00",
    vatRate: "20",
    benefitCode: null,
    lineBaseAmount: "10.00",
    lineVatAmount: "2.00",
    rawRowText: description,
  };
}

function createTransactionMock() {
  const store = {
    publications: new Map<string, { id: number; displayName: string; normalizedName: string }>(),
    issueNumbers: new Map<string, { id: number; displayValue: string; normalizedValue: string }>(),
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
      upsert: vi.fn(async ({ create }: { create: { name: string; taxId: string } }) => ({
        id: 1,
        ...create,
      })),
    },
    recipient: {
      upsert: vi.fn(async ({ create }: { create: { name: string; taxId: string } }) => ({
        id: 2,
        ...create,
      })),
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
          update: { displayValue: string };
          create: { displayValue: string; normalizedValue: string };
        }) => {
          const existing = store.issueNumbers.get(where.normalizedValue);

          if (existing) {
            const updated = { ...existing, displayValue: update.displayValue };
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
