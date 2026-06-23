import { DocumentStatus, Prisma } from "@/generated/prisma/client";

import { getStoredPartyTaxId } from "@/lib/documents/party-tax-id";
import {
  type DocumentContour,
  getInvoiceParserByContour,
  normalizeLookupKey,
} from "@/lib/pdf/parser";
import { prisma } from "@/lib/prisma";

type IngestVatInvoiceInput = {
  documentId: number;
  rawText: string;
  contour: DocumentContour;
};

export const ingestVatInvoice = async ({ documentId, rawText, contour }: IngestVatInvoiceInput) => {
  const parser = getInvoiceParserByContour(contour);
  const parsed = parser.parse(rawText);
  const supplierTaxId = getStoredPartyTaxId({
    contour,
    taxId: parsed.supplier.taxId,
    kpp: parsed.supplier.kpp,
  });
  const recipientTaxId = getStoredPartyTaxId({
    contour,
    taxId: parsed.recipient.taxId,
    kpp: parsed.recipient.kpp,
  });

  return prisma.$transaction(async (tx) => {
    const supplier = await tx.supplier.upsert({
      where: { taxId: supplierTaxId },
      update: { name: parsed.supplier.name, kpp: parsed.supplier.kpp },
      create: {
        name: parsed.supplier.name,
        taxId: supplierTaxId,
        kpp: parsed.supplier.kpp,
      },
    });

    const recipient = await tx.recipient.upsert({
      where: { taxId: recipientTaxId },
      update: { name: parsed.recipient.name, kpp: parsed.recipient.kpp },
      create: {
        name: parsed.recipient.name,
        taxId: recipientTaxId,
        kpp: parsed.recipient.kpp,
      },
    });

    await tx.specialDocument.deleteMany({
      where: { documentId },
    });

    const lineItemsWithPublicationIssue = await Promise.all(
      parsed.lineItems.map(async (item) => {
        const publicationIssue = parser.parsePublicationIssueDescription(
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
          where: {
            normalizedName: normalizeLookupKey(
              publicationIssue.publicationName,
              parser.lookupLocale,
            ),
          },
          update: { displayName: publicationIssue.publicationName },
          create: {
            displayName: publicationIssue.publicationName,
            normalizedName: normalizeLookupKey(
              publicationIssue.publicationName,
              parser.lookupLocale,
            ),
          },
        });

        const issueNumber = await tx.issueNumber.upsert({
          where: {
            normalizedValue: normalizeLookupKey(
              publicationIssue.canonicalIssueNumber,
              parser.lookupLocale,
            ),
          },
          update: {
            canonicalValue: publicationIssue.canonicalIssueNumber,
          },
          create: {
            rawValue: publicationIssue.rawIssueNumber,
            canonicalValue: publicationIssue.canonicalIssueNumber,
            normalizedValue: normalizeLookupKey(
              publicationIssue.canonicalIssueNumber,
              parser.lookupLocale,
            ),
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
        documentContour: contour,
        parserVersion: parser.parserVersion,
        documentType: parsed.documentType,
        documentNumber: parsed.documentNumber,
        documentDate: parseDocumentDate(parsed.documentDate),
        supplierId: supplier.id,
        recipientId: recipient.id,
        currency: getCurrencyByContour(contour),
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
            sourceRowCode: item.sourceRowCode,
            serviceCode: item.serviceCode,
            itemTypeCode: item.itemTypeCode,
            unitName: item.unitName,
            unitCode: item.unitCode,
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            vatRate: item.vatRate,
            benefitCode: item.benefitCode,
            lineBaseAmount: new Prisma.Decimal(item.lineBaseAmount),
            lineVatAmount: new Prisma.Decimal(item.lineVatAmount),
            exciseAmount: item.exciseAmount ? new Prisma.Decimal(item.exciseAmount) : null,
            lineTotalAmount: item.lineTotalAmount ? new Prisma.Decimal(item.lineTotalAmount) : null,
            countryCode: item.countryCode,
            countryName: item.countryName,
            customsDeclarationNumber: item.customsDeclarationNumber,
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

const getCurrencyByContour = (contour: DocumentContour): string =>
  contour === "RU" ? "RUB" : "UAH";
