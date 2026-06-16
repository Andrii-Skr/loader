"use client";

import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { uploadInvoice } from "@/app/actions/documents";
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

type UploadInvoiceValues = {
  pdf: File[];
};

export function UploadInvoiceForm() {
  const router = useRouter();
  const t = useTranslations("UploadForm");
  const [isPending, startTransition] = useTransition();
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [result, setResult] = useState<{ error: string | null; success: string | null }>({
    error: null,
    success: null,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const form = useForm<UploadInvoiceValues>({
    defaultValues: {
      pdf: [],
    },
  });

  const selectFiles = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    const pdfFiles = files.filter((file) => file.type === "application/pdf");

    if (pdfFiles.length === 0) {
      setResult({ error: t("messages.missingPdf"), success: null });
      form.setValue("pdf", [], { shouldValidate: true });
      return;
    }

    setSelectedFiles(pdfFiles);
    form.setValue("pdf", pdfFiles, { shouldValidate: true });
    setResult((current) => ({ ...current, error: null }));
  };

  const formatActionResult = (actionResult: Awaited<ReturnType<typeof uploadInvoice>>) => {
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
    });

    if (failedItems.length === 0) {
      return { error: null, success: summary };
    }

    const details = failedItems
      .map((item) => {
        if (!item.errorKey) {
          return null;
        }

        const translatedMessage =
          item.errorKey === "parseFailed"
            ? `${t("messages.parseFailedPrefix")}: ${item.detail ?? ""}`
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
      success: summary,
    };
  };

  const onSubmit = () => {
    const files = selectedFiles;

    if (files.length === 0) {
      setResult({ error: t("messages.missingPdf"), success: null });
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      for (const file of files) {
        formData.append("pdf", file);
      }
      const actionResult = await uploadInvoice(formData);
      setResult(formatActionResult(actionResult));
      if (!actionResult.errorKey) {
        setSelectedFiles([]);
        form.reset();
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
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
          name="pdf"
          render={() => (
            <FormItem>
              <FormLabel>{t("pdfLabel")}</FormLabel>
              <FormControl>
                <FileDropzone
                  ref={fileInputRef}
                  accept="application/pdf"
                  active={isDragging}
                  multiple
                  description={t("dropzoneBody")}
                  hint={
                    selectedFiles.length > 0
                      ? t("selectedFilesHint", { count: selectedFiles.length })
                      : t("dropzoneHint")
                  }
                  id="pdf"
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
    </Form>
  );
}
