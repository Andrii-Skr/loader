import { copyDocumentIssueMappings } from "../src/lib/documents/revisions";
import { prisma } from "../src/lib/prisma";

const run = async () => {
  const revisions = await prisma.document.findMany({
    where: {
      isCurrent: true,
      supersedesId: { not: null },
    },
    select: {
      id: true,
      supersedesId: true,
    },
  });

  let copiedCount = 0;

  for (const revision of revisions) {
    if (revision.supersedesId === null) {
      continue;
    }

    copiedCount += await copyDocumentIssueMappings({
      sourceDocumentId: revision.supersedesId,
      targetDocumentId: revision.id,
    });
  }

  console.info(
    `Copied ${copiedCount} document issue mapping(s) across ${revisions.length} revision(s).`,
  );
};

run()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
