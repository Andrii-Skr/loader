import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";

import { PrismaClient } from "../src/generated/prisma/client";
import { canonicalizeIssueNumber } from "../src/lib/pdf/parser";

loadEnv({ path: ".env.local" });
loadEnv();

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL ?? "",
});

const prisma = new PrismaClient({ adapter });

const formatDocumentDate = (value: Date): string => {
  const day = String(value.getUTCDate()).padStart(2, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const year = value.getUTCFullYear();

  return `${day}.${month}.${year}`;
};

const normalizeLookupKey = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA");

async function main() {
  const lineItems = await prisma.specialDocument.findMany({
    where: {
      publicationIssueId: { not: null },
      document: {
        documentDate: { not: null },
      },
    },
    select: {
      id: true,
      publicationIssueId: true,
      document: {
        select: {
          documentDate: true,
        },
      },
      publicationIssue: {
        select: {
          id: true,
          publicationId: true,
          issueNumber: {
            select: {
              id: true,
              rawValue: true,
              canonicalValue: true,
              normalizedValue: true,
            },
          },
        },
      },
    },
  });

  let rewiredCount = 0;
  const skippedLineItemIds: number[] = [];
  const publicationIssueCache = new Map<string, number>();

  for (const lineItem of lineItems) {
    const documentDate = lineItem.document.documentDate;
    const publicationIssue = lineItem.publicationIssue;
    const issueNumber = publicationIssue?.issueNumber;

    if (!documentDate || !publicationIssue || !issueNumber) {
      skippedLineItemIds.push(lineItem.id);
      continue;
    }

    const canonicalValue = canonicalizeIssueNumber(
      issueNumber.rawValue,
      formatDocumentDate(documentDate),
    );
    const normalizedValue = normalizeLookupKey(canonicalValue);

    const canonicalIssueNumber = await prisma.issueNumber.upsert({
      where: {
        normalizedValue,
      },
      update: {
        canonicalValue,
      },
      create: {
        rawValue: issueNumber.rawValue,
        canonicalValue,
        normalizedValue,
      },
      select: {
        id: true,
      },
    });

    const publicationIssueKey = `${publicationIssue.publicationId}:${canonicalIssueNumber.id}`;
    let targetPublicationIssueId = publicationIssueCache.get(publicationIssueKey);

    if (!targetPublicationIssueId) {
      const targetPublicationIssue = await prisma.publicationIssue.upsert({
        where: {
          publicationId_issueNumberId: {
            publicationId: publicationIssue.publicationId,
            issueNumberId: canonicalIssueNumber.id,
          },
        },
        update: {},
        create: {
          publicationId: publicationIssue.publicationId,
          issueNumberId: canonicalIssueNumber.id,
        },
        select: {
          id: true,
        },
      });

      targetPublicationIssueId = targetPublicationIssue.id;
      publicationIssueCache.set(publicationIssueKey, targetPublicationIssueId);
    }

    if (lineItem.publicationIssueId !== targetPublicationIssueId) {
      await prisma.specialDocument.update({
        where: { id: lineItem.id },
        data: {
          publicationIssueId: targetPublicationIssueId,
        },
      });
      rewiredCount += 1;
    }
  }

  await prisma.publicationIssue.deleteMany({
    where: {
      lineItems: {
        none: {},
      },
    },
  });

  await prisma.issueNumber.deleteMany({
    where: {
      publicationIssues: {
        none: {},
      },
    },
  });

  console.log(
    JSON.stringify(
      {
        processedLineItems: lineItems.length,
        rewiredLineItems: rewiredCount,
        skippedLineItemIds,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
