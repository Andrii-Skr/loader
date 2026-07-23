import { cache } from "react";

import { Pool } from "pg";

import { getDocumentMappingStatus } from "@/lib/documents/mapping-status";
import { prisma } from "@/lib/prisma";
import {
  getExternalEditionConnectionString,
  getExternalEditionSchema,
} from "@/lib/publication-mappings/config";
import { parseReconciliationMonthKey } from "@/lib/reconciliation/period";
import {
  buildMonthlyReconciliationReport,
  normalizePdfRowForSupplier,
} from "@/lib/reconciliation/service";
import type { ReconciliationSourceRow } from "@/lib/reconciliation/types";

const schemaIdentifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const globalForExternalReconciliationPool = globalThis as unknown as {
  externalReconciliationPool: Pool | undefined;
};

const externalPool =
  globalForExternalReconciliationPool.externalReconciliationPool ??
  new Pool({
    connectionString: getExternalEditionConnectionString(),
  });

if (process.env.NODE_ENV !== "production") {
  globalForExternalReconciliationPool.externalReconciliationPool = externalPool;
}

const quoteSchemaIdentifier = (schema: string) => {
  if (!schemaIdentifierPattern.test(schema)) {
    throw new Error(`Unsafe external edition schema name: ${schema}`);
  }

  return `"${schema}"`;
};

type ExternalReconciliationRow = {
  selectedExternalPeriod: string;
  receiptPeriodCode: number;
  receiptPeriod: string;
  externalEditionId: number | null;
  externalEditionName: string | null;
  externalIssueId: number | null;
  externalIssueNumber: string | null;
  quantity: string | null;
};

const getExternalReceiptRows = async (externalPeriod: string) => {
  const schemaSql = quoteSchemaIdentifier(getExternalEditionSchema());
  const result = await externalPool.query<ExternalReconciliationRow>(
    `
      SELECT
        selected."Период" AS "selectedExternalPeriod",
        period."Код" AS "receiptPeriodCode",
        period."Период" AS "receiptPeriod",
        goods."КодИздания" AS "externalEditionId",
        edition."Издание" AS "externalEditionName",
        goods."КодНомера" AS "externalIssueId",
        issue."Номер" AS "externalIssueNumber",
        goods."КолПриход"::text AS "quantity"
      FROM ${schemaSql}."Периоды" selected
      INNER JOIN ${schemaSql}."Периоды" period
        ON period."Код" BETWEEN selected."Код" - 1 AND selected."Код" + 1
      LEFT JOIN ${schemaSql}."ПриходТовар" goods
        ON goods."Период_temp" = period."Код"
      LEFT JOIN ${schemaSql}."Издание" edition
        ON edition."КодИздания" = goods."КодИздания"
      LEFT JOIN ${schemaSql}."Номер_Издания" issue
        ON issue."КодНомера" = goods."КодНомера"
      WHERE selected."Период" = $1
      ORDER BY period."Код" ASC
    `,
    [externalPeriod],
  );

  const resolvedPeriod = result.rows[0]?.selectedExternalPeriod ?? null;
  const rows = result.rows.flatMap((row): ReconciliationSourceRow[] => {
    if (
      row.externalEditionId === null ||
      row.externalEditionName === null ||
      row.externalIssueId === null ||
      row.externalIssueNumber === null ||
      row.quantity === null
    ) {
      return [];
    }

    return [
      {
        externalEditionId: row.externalEditionId,
        externalEditionName: row.externalEditionName,
        externalIssueId: row.externalIssueId,
        externalIssueNumber: row.externalIssueNumber,
        quantity: row.quantity,
        unitPrice: null,
        lineTotalAmount: null,
        receiptPeriodCode: row.receiptPeriodCode,
        receiptPeriod: row.receiptPeriod,
      },
    ];
  });

  return { externalPeriod: resolvedPeriod, rows };
};

export const getMonthlyReconciliationReport = cache(async (monthKey: string) => {
  const month = parseReconciliationMonthKey(monthKey);

  if (!month) {
    return null;
  }

  const [documents, externalReceipt] = await Promise.all([
    prisma.document.findMany({
      where: {
        documentDate: {
          gte: month.start,
          lt: month.end,
        },
      },
      include: {
        supplier: {
          select: {
            name: true,
          },
        },
        lineItems: {
          select: {
            publicationIssueConfirmedAt: true,
            externalMatchCount: true,
            publicationIssue: {
              select: {
                publication: {
                  select: {
                    _count: {
                      select: {
                        mappings: true,
                      },
                    },
                  },
                },
              },
            },
            externalMatches: {
              select: {
                externalEditionId: true,
                externalEditionName: true,
                externalIssueId: true,
                externalIssueNumber: true,
                quantity: true,
                unitPrice: true,
                lineVatAmount: true,
                lineTotalAmount: true,
              },
            },
          },
        },
      },
    }),
    getExternalReceiptRows(month.externalPeriod),
  ]);

  const pdfRows = documents.flatMap((document) => {
    if (getDocumentMappingStatus(document.lineItems) !== "fullyMatched") {
      return [];
    }

    return document.lineItems.flatMap((lineItem) =>
      lineItem.externalMatches.flatMap((match): ReconciliationSourceRow[] => {
        if (match.externalIssueId === null || match.externalIssueNumber === null) {
          return [];
        }

        return [
          normalizePdfRowForSupplier({
            supplierName: document.supplier?.name ?? null,
            row: {
              externalEditionId: match.externalEditionId,
              externalEditionName: match.externalEditionName,
              externalIssueId: match.externalIssueId,
              externalIssueNumber: match.externalIssueNumber,
              quantity: match.quantity.toString(),
              unitPrice: match.unitPrice?.toString() ?? null,
              lineVatAmount: match.lineVatAmount?.toString() ?? null,
              lineTotalAmount: match.lineTotalAmount?.toString() ?? null,
            },
          }),
        ];
      }),
    );
  });

  return buildMonthlyReconciliationReport({
    monthKey,
    externalPeriod: externalReceipt.externalPeriod,
    pdfRows,
    receiptRows: externalReceipt.rows,
  });
});
