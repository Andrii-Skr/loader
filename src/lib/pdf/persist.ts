import { DocumentStatus, Prisma } from "@/generated/prisma/client";

import { parsePublicationIssueDescription, parseVatInvoiceUaV1 } from "@/lib/pdf/parser";
import { prisma } from "@/lib/prisma";

type IngestVatInvoiceInput = {
  documentId: number;
  rawText: string;
};

export const ingestVatInvoice = async ({ documentId, rawText }: IngestVatInvoiceInput) => {
  const parsed = parseVatInvoiceUaV1(rawText);

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.upsert({
      where: { taxId: parsed.supplier.taxId },
      update: { name: parsed.supplier.name },
      create: {
        name: parsed.supplier.name,
        taxId: parsed.supplier.taxId,
      },
    });

    const recipient = await tx.recipient.upsert({
      where: { taxId: parsed.recipient.taxId },
      update: { name: parsed.recipient.name },
      create: {
        name: parsed.recipient.name,
        taxId: parsed.recipient.taxId,
      },
    });

    await tx.specialDocument.deleteMany({
      where: { documentId },
    });

    const lineItemsWithPublicationIssue = await Promise.all(
      parsed.lineItems.map(async (item) => {
        const publicationIssue = parsePublicationIssueDescription(
          item.description,
          parsed.documentDate,
        );

        if (!publicationIssue) {
          return {
            item,
            publicationIssueId: null,
            parseFailed: true,
          };
        }

        const publication = await tx.publication.upsert({
          where: { normalizedName: normalizeLookupKey(publicationIssue.publicationName) },
          update: { displayName: publicationIssue.publicationName },
          create: {
            displayName: publicationIssue.publicationName,
            normalizedName: normalizeLookupKey(publicationIssue.publicationName),
          },
        });

        const issueNumber = await tx.issueNumber.upsert({
          where: { normalizedValue: normalizeLookupKey(publicationIssue.canonicalIssueNumber) },
          update: {
            canonicalValue: publicationIssue.canonicalIssueNumber,
          },
          create: {
            rawValue: publicationIssue.rawIssueNumber,
            canonicalValue: publicationIssue.canonicalIssueNumber,
            normalizedValue: normalizeLookupKey(publicationIssue.canonicalIssueNumber),
          },
        });

        const publicationIssueRecord = await tx.publicationIssue.upsert({
          where: {
            publicationId_issueNumberId: {
              publicationId: publication.id,
              issueNumberId: issueNumber.id,
            },
          },
          update: {},
          create: {
            publicationId: publication.id,
            issueNumberId: issueNumber.id,
          },
        });

        return {
          item,
          publicationIssueId: publicationIssueRecord.id,
          parseFailed: false,
        };
      }),
    );

    const reviewRequired =
      parsed.reviewRequired || lineItemsWithPublicationIssue.some((item) => item.parseFailed);

    const document = await tx.document.update({
      where: { id: documentId },
      data: {
        parserVersion: "vat-invoice-ua-v1",
        documentType: parsed.documentType,
        documentNumber: parsed.documentNumber,
        documentDate: parseDocumentDate(parsed.documentDate),
        supplierId: supplier.id,
        recipientId: recipient.id,
        totalAmount: new Prisma.Decimal(parsed.totalAmount),
        vatAmount: parsed.vatAmount ? new Prisma.Decimal(parsed.vatAmount) : null,
        baseAmount: parsed.baseAmount ? new Prisma.Decimal(parsed.baseAmount) : null,
        rawText,
        extractionStatus: reviewRequired ? DocumentStatus.NEEDS_REVIEW : DocumentStatus.PROCESSED,
        reviewRequired,
        extractedAt: new Date(),
        lineItems: {
          create: lineItemsWithPublicationIssue.map(({ item, publicationIssueId }) => ({
            lineNo: item.lineNo,
            description: item.description,
            publicationIssueId,
            serviceCode: item.serviceCode,
            unitName: item.unitName,
            unitCode: item.unitCode,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            vatRate: item.vatRate,
            benefitCode: item.benefitCode,
            lineBaseAmount: new Prisma.Decimal(item.lineBaseAmount),
            lineVatAmount: new Prisma.Decimal(item.lineVatAmount),
            rawRowText: item.rawRowText,
          })),
        },
      },
      include: {
        supplier: true,
        recipient: true,
        lineItems: {
          orderBy: { lineNo: "asc" },
        },
      },
    });

    return document;
  });
};

const parseDocumentDate = (value: string): Date => {
  const [day, month, year] = value.split(".");
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
};

const normalizeLookupKey = (value: string): string =>
  value.replace(/\s+/g, " ").trim().toLocaleLowerCase("uk-UA");
