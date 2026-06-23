import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => ({
  publicationIssueFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicationIssue: {
      findMany: prismaMocks.publicationIssueFindMany,
    },
  },
}));

vi.mock("@/lib/publication-mappings/service", () => ({
  getExactCandidateCounts: vi.fn(async () => new Map()),
}));

import { getPublicationIssueRegistry } from "@/lib/publication-mappings/queries";

describe("getPublicationIssueRegistry", () => {
  beforeEach(() => {
    prismaMocks.publicationIssueFindMany.mockReset();
    prismaMocks.publicationIssueFindMany.mockResolvedValue([]);
  });

  it("does not scope the global unmatched filter to the document context", async () => {
    await getPublicationIssueRegistry("unmatched", 42);

    expect(prismaMocks.publicationIssueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { publication: { is: { mappings: { none: {} } } } },
            { issueNumber: { is: { mappings: { none: {} } } } },
          ],
        },
      }),
    );
  });

  it("scopes the document-unmatched filter to the selected document", async () => {
    await getPublicationIssueRegistry("document-unmatched", 42);

    expect(prismaMocks.publicationIssueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          lineItems: {
            some: {
              documentId: 42,
            },
          },
          OR: [
            { publication: { is: { mappings: { none: {} } } } },
            { issueNumber: { is: { mappings: { none: {} } } } },
          ],
        },
      }),
    );
  });

  it("does not scope the global all filter to the document context", async () => {
    await getPublicationIssueRegistry("all", 42);

    expect(prismaMocks.publicationIssueFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
      }),
    );
  });
});
