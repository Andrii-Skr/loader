import { Prisma } from "@/generated/prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  documentFindMany: vi.fn(),
  externalQuery: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { document: { findMany: mocks.documentFindMany } },
}));
vi.mock("pg", () => ({
  Pool: class {
    query = mocks.externalQuery;
  },
}));
vi.mock("@/lib/publication-mappings/config", () => ({
  getExternalEditionConnectionString: () => "postgresql://test:test@localhost/test",
  getExternalEditionSchema: () => "public",
}));

import { getMonthlyReconciliationReport } from "./queries";

describe("getMonthlyReconciliationReport", () => {
  beforeEach(() => {
    mocks.documentFindMany.mockReset();
    mocks.externalQuery.mockReset();
    mocks.externalQuery.mockResolvedValue({ rows: [] });
  });

  it("counts only the selected version when both versions have confirmed mappings", async () => {
    const documents = [
      { isCurrent: false, quantity: "100" },
      { isCurrent: true, quantity: "120" },
    ].map(({ isCurrent, quantity }) => ({
      isCurrent,
      supplier: { name: "Test supplier" },
      lineItems: [
        {
          publicationIssueConfirmedAt: new Date("2026-04-01"),
          externalMatchCount: 1,
          publicationIssue: null,
          externalMatches: [
            {
              externalEditionId: 11,
              externalEditionName: "Test edition",
              externalIssueId: 42,
              externalIssueNumber: "4",
              quantity: new Prisma.Decimal(quantity),
              unitPrice: new Prisma.Decimal(1),
              lineVatAmount: new Prisma.Decimal(0),
              lineTotalAmount: new Prisma.Decimal(quantity),
            },
          ],
        },
      ],
    }));
    mocks.documentFindMany.mockImplementation(async ({ where }) =>
      documents.filter(
        (document) => where.isCurrent === undefined || document.isCurrent === where.isCurrent,
      ),
    );

    const report = await getMonthlyReconciliationReport("2026-04");

    expect(report?.mismatches).toHaveLength(1);
    expect(report?.mismatches[0]?.pdf).toMatchObject({
      quantity: "120.000",
      totalAmount: "120.00",
    });
  });
});
