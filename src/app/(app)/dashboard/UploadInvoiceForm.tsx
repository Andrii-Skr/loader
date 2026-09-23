"use client";

import { LoaderCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import {
  type InvoiceVersionSummary,
  selectInvoiceVersion,
  uploadDocuments,
} from "@/app/actions/documents";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/ui/file-dropzone";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useRouter } from "@/i18n/navigation";
import { normalizePartyName } from "@/lib/documents/party-name";

type UploadDocumentValues = {
  document: File[];
};

type UploadActionResult = Awaited<ReturnType<typeof uploadDocuments>>;

const parseVersionDate = (value: string) => {
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const localMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  const parts = isoMatch
    ? { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]) }
    : localMatch
      ? { year: Number(localMatch[3]), month: Number(localMatch[2]), day: Number(localMatch[1]) }
      : null;

  if (!parts) {
    return null;
  }

  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

  return Number.isNaN(date.getTime()) ? null : date;
};

const combineUploadResults = (results: UploadActionResult[]): UploadActionResult => ({
  errorKey: results.find((result) => result.errorKey)?.errorKey ?? null,
  successCount: results.reduce((total, result) => total + result.successCount, 0),
  failedCount: results.reduce((total, result) => total + result.failedCount, 0),
  duplicateCount: results.reduce((total, result) => total + result.duplicateCount, 0),
  replacementCount: results.reduce((total, result) => total + result.replacementCount, 0),
  results: results.flatMap((result) => result.results),
});

export function UploadDocumentForm() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("UploadForm");
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [result, setResult] = useState<{ error: string | null; success: string | null }>({
    error: null,
    success: null,
  });
  const [versionSelections, setVersionSelections] = useState<
    Array<{ previous: InvoiceVersionSummary; uploaded: InvoiceVersionSummary }>
  >([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const form = useForm<UploadDocumentValues>({
    defaultValues: {
      document: [],
    },
  });

  const selectFiles = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const supportedFiles = files.filter(
      (file) =>
        file.type === "application/pdf" ||
        file.type === "application/vnd.ms-excel" ||
        file.name.toLocaleLowerCase("en-US").endsWith(".xls"),
    );

    if (supportedFiles.length === 0) {
      setResult({ error: t("messages.missingPdf"), success: null });
      form.setValue("document", [], { shouldValidate: true });
      return;
    }

    setSelectedFiles(supportedFiles);
    form.setValue("document", supportedFiles, { shouldValidate: true });
    setResult((current) => ({ ...current, error: null }));
  };

  const formatActionResult = (actionResult: Awaited<ReturnType<typeof uploadDocuments>>) => {
    if (actionResult.errorKey) {
      return {
        error: t(`messages.${actionResult.errorKey}`),
        success: null,
      };
    }

    const failedItems = actionResult.results.filter((item) => item.errorKey);
    const summary = t("messages.batchSummary", {
      success: actionResult.successCount,
      duplicates: actionResult.duplicateCount,
      failed: actionResult.failedCount,
      replacements: actionResult.replacementCount,
    });
    const replacementEntries = actionResult.results
      .filter((item) => Number.isInteger(item.replacedDocumentId))
      .map((item) =>
        t("messages.replacementEntry", {
          previous: item.replacedDocumentName ?? item.fileName,
          previousRevision: item.replacedRevision ?? 0,
          current: item.fileName,
          currentRevision: item.revision ?? 0,
        }),
      );
    const replacementDetails =
      replacementEntries.length > 0
        ? t("messages.replacementDetails", { replacements: replacementEntries.join(", ") })
        : null;
    const successMessage = [summary, replacementDetails].filter(Boolean).join(" ");

    if (failedItems.length === 0) {
      return { error: null, success: successMessage };
    }

    const details = failedItems
      .map((item) => {
        if (!item.errorKey) {
          return null;
        }

        const translatedMessage =
          item.errorKey === "parseFailed"
            ? `${t("messages.parseFailedPrefix")}: ${item.detail ?? ""}`
            : item.errorKey === "documentContourUnknown"
              ? `${t("messages.documentContourUnknown")}${item.detail ? `: ${item.detail}` : ""}`
              : item.errorKey === "documentContourAmbiguous"
                ? `${t("messages.documentContourAmbiguous")}${item.detail ? `: ${item.detail}` : ""}`
                : item.errorKey === "pdfReadFailed"
                  ? `${t("messages.pdfReadFailed")}${item.detail ? `: ${item.detail}` : ""}`
                  : item.errorKey === "pdfOcrFailed"
                    ? `${t("messages.pdfOcrFailed")}${item.detail ? `: ${item.detail}` : ""}`
                    : item.errorKey === "pdfOcrUnavailable"
                      ? `${t("messages.pdfOcrUnavailable")}${item.detail ? `: ${item.detail}` : ""}`
                      : item.errorKey === "pdfHasNoTextLayer"
                        ? t("messages.pdfHasNoTextLayer")
                        : t(`messages.${item.errorKey}`);

        return `${item.fileName}: ${translatedMessage}`;
      })
      .filter(Boolean)
      .join("\n");

    return {
      error: details,
      success: successMessage,
    };
  };

  const onSubmit = () => {
    const files = selectedFiles;

    if (files.length === 0) {
      setResult({ error: t("messages.missingPdf"), success: null });
      return;
    }

    startTransition(async () => {
      const actionResults: UploadActionResult[] = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append("document", file);

        try {
          const actionResult = await uploadDocuments(formData);
          actionResults.push(actionResult);

          if (actionResult.errorKey) {
            break;
          }
        } catch {
          setResult({ error: t("messages.requestFailed"), success: null });
          return;
        }
      }

      const actionResult = combineUploadResults(actionResults);
      setResult(formatActionResult(actionResult));
      const pendingSelections = actionResult.results.flatMap((item) =>
        item.versionSelection ? [item.versionSelection] : [],
      );

      if (!actionResult.errorKey) {
        setSelectedFiles([]);
        form.reset();
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        if (pendingSelections.length > 0) {
          setVersionSelections(pendingSelections);
          return;
        }
        router.refresh();
      }
    });
  };

  const currentVersionSelection = versionSelections[0] ?? null;
  const formatVersionSummary = (version: InvoiceVersionSummary) => {
    const parsedDocumentDate = version.documentDate ? parseVersionDate(version.documentDate) : null;
    const documentDate = parsedDocumentDate
      ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(
          parsedDocumentDate,
        )
      : t("versionSelection.unknownValue");
    const amount = version.totalAmount
      ? new Intl.NumberFormat(locale, { style: "currency", currency: version.currency }).format(
          Number(version.totalAmount),
        )
      : t("versionSelection.unknownValue");

    return {
      amount,
      documentDate,
      documentNumber: version.documentNumber ?? t("versionSelection.unknownValue"),
      sourceFileName: version.sourceFileName,
      recipientName: version.recipientName
        ? normalizePartyName(version.recipientName)
        : t("versionSelection.unknownValue"),
      supplierName: version.supplierName
        ? normalizePartyName(version.supplierName)
        : t("versionSelection.unknownValue"),
    };
  };

  const selectVersion = (documentId: number) => {
    startTransition(async () => {
      const actionResult = await selectInvoiceVersion({ documentId, locale });

      if (actionResult.errorKey) {
        setResult({ error: t(`messages.${actionResult.errorKey}`), success: null });
        return;
      }

      setVersionSelections((selections) => selections.slice(1));
      if (versionSelections.length <= 1) {
        router.refresh();
      }
    });
  };

  return (
    <Form {...form}>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <FormField
          control={form.control}
          name="document"
          render={() => (
            <FormItem>
              <FormLabel>{t("pdfLabel")}</FormLabel>
              <FormControl>
                <FileDropzone
                  ref={fileInputRef}
                  accept="application/pdf,.xls,application/vnd.ms-excel"
                  active={isDragging}
                  multiple
                  description={t("dropzoneBody")}
                  hint={
                    selectedFiles.length > 0
                      ? t("selectedFilesHint", { count: selectedFiles.length })
                      : t("dropzoneHint")
                  }
                  id="document"
                  title={t("dropzoneTitle")}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(event) => {
                    event.preventDefault();
                    const nextTarget = event.relatedTarget;

                    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
                      return;
                    }

                    setIsDragging(false);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    selectFiles(Array.from(event.dataTransfer.files ?? []));
                  }}
                  onFileSelect={(files) => {
                    selectFiles(files);
                  }}
                />
              </FormControl>
              <FormDescription>{t("dropzoneBody")}</FormDescription>
              <FormMessage>{result.error}</FormMessage>
            </FormItem>
          )}
        />

        {result.success ? (
          <p className="whitespace-pre-line text-sm text-[color:var(--success)]">
            {result.success}
          </p>
        ) : null}

        {result.error ? (
          <p className="whitespace-pre-line text-sm text-[color:var(--destructive)]">
            {result.error}
          </p>
        ) : null}

        <Button disabled={isPending} type="submit">
          {isPending ? <LoaderCircle className="animate-spin" /> : null}
          {isPending ? t("pending") : t("submit")}
        </Button>
      </form>
      <AlertDialog open={currentVersionSelection !== null}>
        <AlertDialogContent className="max-w-3xl rounded-[28px] border-[color:var(--line)] bg-[color:var(--panel-strong)] shadow-[var(--shadow)]">
          <AlertDialogHeader className="place-items-start text-left">
            <AlertDialogTitle className="font-[var(--font-display)] text-[1.7rem] leading-tight tracking-[-0.03em] text-[color:var(--ink)]">
              {t("versionSelection.title")}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[color:var(--ink-soft)]">
              {t("versionSelection.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {currentVersionSelection ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { key: "previous", version: currentVersionSelection.previous },
                { key: "uploaded", version: currentVersionSelection.uploaded },
              ].map(({ key, version }) => {
                const summary = formatVersionSummary(version);

                return (
                  <section
                    className="flex h-full flex-col rounded-2xl border border-[color:var(--line)] bg-[color:var(--panel)] p-4"
                    key={key}
                  >
                    <strong>{t(`versionSelection.${key}Title`)}</strong>
                    <div
                      className="mt-2 min-h-10 break-words text-xs text-[color:var(--ink-soft)]"
                      title={summary.sourceFileName}
                    >
                      {t("versionSelection.fileName", { value: summary.sourceFileName })}
                    </div>
                    <div className="grid gap-2 pt-6 text-sm text-[color:var(--ink-soft)]">
                      <div>{t("versionSelection.number", { value: summary.documentNumber })}</div>
                      <div>{t("versionSelection.date", { value: summary.documentDate })}</div>
                      <div>{t("versionSelection.supplier", { value: summary.supplierName })}</div>
                      <div>{t("versionSelection.recipient", { value: summary.recipientName })}</div>
                    </div>
                    <div className="mt-6 font-semibold tabular-nums">{summary.amount}</div>
                    <Button
                      className="mt-auto translate-y-2"
                      disabled={isPending}
                      onClick={() => selectVersion(version.id)}
                      type="button"
                    >
                      {t("versionSelection.select")}
                    </Button>
                  </section>
                );
              })}
            </div>
          ) : null}
          <AlertDialogFooter>
            <p className="mr-auto text-xs text-[color:var(--ink-soft)]">
              {t("versionSelection.historyHint")}
            </p>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}

export const UploadInvoiceForm = UploadDocumentForm;
