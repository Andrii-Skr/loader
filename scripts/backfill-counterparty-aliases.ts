import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
const { prisma } = await import("../src/lib/prisma");
const { backfillCounterpartyAliases } = await import("../src/lib/counterparties/backfill");
try {
  const apply = process.argv.includes("--apply");
  if (apply) {
    const [suppliers, recipients, documents] = await Promise.all([
      prisma.supplier.findMany({ include: { aliases: true } }),
      prisma.recipient.findMany({ include: { aliases: true } }),
      prisma.document.findMany({ select: { id: true, supplierId: true, recipientId: true } }),
    ]);
    const backupPath = join(await mkdtemp(join(tmpdir(), "loader-counterparties-")), "before.json");
    await writeFile(backupPath, JSON.stringify({ suppliers, recipients, documents }, null, 2), {
      mode: 0o600,
    });
    console.log(`Backup: ${backupPath}`);
  }
  console.log(JSON.stringify({ apply, ...(await backfillCounterpartyAliases(apply)) }, null, 2));
} finally {
  await prisma.$disconnect();
}
