import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMocks = vi.hoisted(() => {
  const publicationIssueFindUnique = vi.fn();
  const publicationFindMany = vi.fn();
  const issueFindMany = vi.fn();
  const publicationDeleteMany = vi.fn();
  const publicationCreateMany = vi.fn();
  const issueDeleteMany = vi.fn();
  const issueCreateMany = vi.fn();
  const externalEditionSourceUpsert = vi.fn();
  const tx = {
    externalEditionSource: {
      upsert: externalEditionSourceUpsert,
    },
    publicationMapping: {
      deleteMany: publicationDeleteMany,
      createMany: publicationCreateMany,
    },
    issueNumberMapping: {
      deleteMany: issueDeleteMany,
      createMany: issueCreateMany,
    },
  };

  return {
    externalEditionSourceUpsert,
    publicationIssueFindUnique,
    publicationMappingFindMany: publicationFindMany,
    issueNumberMappingFindMany: issueFindMany,
    transaction: vi.fn(async (callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    tx,
  };
});

const externalRepositoryMocks = vi.hoisted(() => ({
  getExternalEditionsByIds: vi.fn(),
  getExternalIssueNumbersByIds: vi.fn(),
  searchExternalEditions: vi.fn(),
  searchExternalIssueNumbersByEdition: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    externalEditionSource: {
      upsert: prismaMocks.externalEditionSourceUpsert,
    },
    publicationIssue: {
      findUnique: prismaMocks.publicationIssueFindUnique,
    },
    publicationMapping: {
      findMany: prismaMocks.publicationMappingFindMany,
      deleteMany: vi.fn(),
    },
    issueNumberMapping: {
      findMany: prismaMocks.issueNumberMappingFindMany,
      deleteMany: vi.fn(),
    },
    $transaction: prismaMocks.transaction,
  },
}));

vi.mock("@/lib/publication-mappings/external-repository", () => externalRepositoryMocks);

vi.mock("@/lib/publication-mappings/config", () => ({
  getExternalEditionSchema: () => "idz_ukr",
  getExternalEditionSourceCode: () => "idz-ukr",
  getExternalEditionSourceName: () => "IDZ-UKR",
}));

import {
  replaceIssueNumberMappings,
  replacePublicationMappings,
  searchIssueNumberCandidates,
  searchPublicationCandidates,
} from "@/lib/publication-mappings/service";

describe("searchPublicationCandidates", () => {
  beforeEach(() => {
    prismaMocks.publicationIssueFindUnique.mockReset();
    externalRepositoryMocks.searchExternalEditions.mockReset();
  });

  it("prioritizes the exact normalized edition over broader partial matches", async () => {
    prismaMocks.publicationIssueFindUnique.mockResolvedValue({
      id: 12,
      publication: {
        id: 3,
        displayName: "Кейворди. Спецвипуск (р)",
      },
      issueNumber: {
        id: 4,
        canonicalValue: "04-26",
      },
    });
    externalRepositoryMocks.searchExternalEditions.mockResolvedValue([
      { id: 4729, name: "Кейворди" },
      { id: 4819, name: "Кейворди. Спецвипуск (R)" },
    ]);

    const candidates = await searchPublicationCandidates({
      publicationIssueId: 12,
    });

    expect(candidates[0]).toMatchObject({
      externalEditionId: 4819,
      externalEditionName: "Кейворди. Спецвипуск (R)",
      isExactMatch: true,
    });
    expect(candidates[1]).toMatchObject({
      externalEditionId: 4729,
      externalEditionName: "Кейворди",
      isExactMatch: false,
    });
  });
});

describe("searchIssueNumberCandidates", () => {
  beforeEach(() => {
    prismaMocks.publicationIssueFindUnique.mockReset();
    externalRepositoryMocks.searchExternalIssueNumbersByEdition.mockReset();
  });

  it("returns an empty list when external edition is not selected", async () => {
    const candidates = await searchIssueNumberCandidates({
      publicationIssueId: 12,
    });

    expect(candidates).toEqual([]);
    expect(prismaMocks.publicationIssueFindUnique).not.toHaveBeenCalled();
    expect(externalRepositoryMocks.searchExternalIssueNumbersByEdition).not.toHaveBeenCalled();
  });

  it("prefers issue numbers with a single slash over duplicated slash variants", async () => {
    prismaMocks.publicationIssueFindUnique.mockResolvedValue({
      id: 12,
      publication: {
        id: 3,
        displayName: "Копейка. ТВ программа",
      },
      issueNumber: {
        id: 4,
        canonicalValue: "06/26",
      },
    });
    externalRepositoryMocks.searchExternalIssueNumbersByEdition.mockResolvedValue([
      { id: 10, number: "06//26" },
      { id: 9, number: "06/26" },
    ]);

    const candidates = await searchIssueNumberCandidates({
      publicationIssueId: 12,
      externalEditionId: 77,
    });

    expect(candidates[0]).toMatchObject({
      externalIssueId: 9,
      externalIssueNumber: "06/26",
      isExactMatch: true,
    });
    expect(candidates[1]).toMatchObject({
      externalIssueId: 10,
      externalIssueNumber: "06//26",
      isExactMatch: true,
    });
    expect(externalRepositoryMocks.searchExternalIssueNumbersByEdition).toHaveBeenCalledWith({
      externalEditionId: 77,
      query: "06/26",
    });
  });

  it("prioritizes the exact typed number over token-only matches", async () => {
    prismaMocks.publicationIssueFindUnique.mockResolvedValue({
      id: 12,
      publication: {
        id: 3,
        displayName: "Копейка. ТВ программа",
      },
      issueNumber: {
        id: 4,
        canonicalValue: "04-26",
      },
    });
    externalRepositoryMocks.searchExternalIssueNumbersByEdition.mockResolvedValue([
      { id: 30, number: "04-25" },
      { id: 31, number: "01-26" },
      { id: 29, number: "01-25" },
    ]);

    const candidates = await searchIssueNumberCandidates({
      publicationIssueId: 12,
      externalEditionId: 77,
      query: "01-25",
    });

    expect(candidates[0]).toMatchObject({
      externalIssueId: 29,
      externalIssueNumber: "01-25",
      isExactMatch: true,
    });
  });
});

describe("replacePublicationMappings", () => {
  beforeEach(() => {
    prismaMocks.externalEditionSourceUpsert.mockReset();
    prismaMocks.publicationMappingFindMany.mockReset();
    prismaMocks.transaction.mockClear();
    prismaMocks.tx.publicationMapping.deleteMany.mockReset();
    prismaMocks.tx.publicationMapping.createMany.mockReset();
    externalRepositoryMocks.getExternalEditionsByIds.mockReset();

    prismaMocks.externalEditionSourceUpsert.mockResolvedValue({
      id: 7,
      code: "idz-ukr",
      displayName: "IDZ-UKR",
      schemaName: "idz_ukr",
    });

    externalRepositoryMocks.getExternalEditionsByIds.mockResolvedValue([
      { id: 101, name: "1000 порад. Кейворди (R)" },
    ]);
    prismaMocks.publicationMappingFindMany.mockResolvedValue([
      {
        id: 1,
        source: {
          code: "idz-ukr",
          displayName: "IDZ-UKR",
        },
        externalEditionId: 101,
        externalEditionName: "1000 порад. Кейворди (R)",
      },
    ]);
  });

  it("deduplicates the same external edition before createMany", async () => {
    const mappings = await replacePublicationMappings({
      publicationId: 5,
      selections: [{ externalEditionId: 101 }, { externalEditionId: 101 }],
    });

    expect(prismaMocks.tx.publicationMapping.deleteMany).toHaveBeenCalledWith({
      where: {
        publicationId: 5,
        sourceId: 7,
      },
    });
    expect(prismaMocks.tx.publicationMapping.createMany).toHaveBeenCalledWith({
      data: [
        {
          publicationId: 5,
          sourceId: 7,
          externalEditionId: 101,
          externalEditionName: "1000 порад. Кейворди (R)",
        },
      ],
    });
    expect(mappings).toHaveLength(1);
  });
});

describe("replaceIssueNumberMappings", () => {
  beforeEach(() => {
    prismaMocks.externalEditionSourceUpsert.mockReset();
    prismaMocks.issueNumberMappingFindMany.mockReset();
    prismaMocks.transaction.mockClear();
    prismaMocks.tx.issueNumberMapping.deleteMany.mockReset();
    prismaMocks.tx.issueNumberMapping.createMany.mockReset();
    externalRepositoryMocks.getExternalIssueNumbersByIds.mockReset();

    prismaMocks.externalEditionSourceUpsert.mockResolvedValue({
      id: 7,
      code: "idz-ukr",
      displayName: "IDZ-UKR",
      schemaName: "idz_ukr",
    });

    externalRepositoryMocks.getExternalIssueNumbersByIds.mockResolvedValue([
      { id: 202, number: "04-26" },
    ]);
    prismaMocks.issueNumberMappingFindMany.mockResolvedValue([
      {
        id: 1,
        source: {
          code: "idz-ukr",
          displayName: "IDZ-UKR",
        },
        externalIssueId: 202,
        externalIssueNumber: "04-26",
      },
    ]);
  });

  it("deduplicates the same external issue number before createMany", async () => {
    const mappings = await replaceIssueNumberMappings({
      issueNumberId: 9,
      selections: [{ externalIssueId: 202 }, { externalIssueId: 202 }],
    });

    expect(prismaMocks.tx.issueNumberMapping.deleteMany).toHaveBeenCalledWith({
      where: {
        issueNumberId: 9,
        sourceId: 7,
      },
    });
    expect(prismaMocks.tx.issueNumberMapping.createMany).toHaveBeenCalledWith({
      data: [
        {
          issueNumberId: 9,
          sourceId: 7,
          externalIssueId: 202,
          externalIssueNumber: "04-26",
        },
      ],
    });
    expect(mappings).toHaveLength(1);
  });
});
