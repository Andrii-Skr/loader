import type { UploadInvoiceActionResult } from "@/app/actions/documents";

export const combineUploadResults = (
  results: UploadInvoiceActionResult[],
): UploadInvoiceActionResult => ({
  errorKey: results.find((result) => result.errorKey)?.errorKey ?? null,
  successCount: results.reduce((total, result) => total + result.successCount, 0),
  failedCount: results.reduce((total, result) => total + result.failedCount, 0),
  duplicateCount: results.reduce((total, result) => total + result.duplicateCount, 0),
  replacementCount: results.reduce((total, result) => total + result.replacementCount, 0),
  results: results.flatMap((result) => result.results),
});

export const uploadDocumentBatch = async (
  files: File[],
  upload: (data: FormData) => Promise<UploadInvoiceActionResult>,
) => {
  const results: UploadInvoiceActionResult[] = [];
  for (const [index, file] of files.entries()) {
    const formData = new FormData();
    formData.append("document", file);
    try {
      const result = await upload(formData);
      results.push(result);
      if (result.errorKey)
        return {
          actionResult: combineUploadResults(results),
          requestFailedFile: null,
          remainingFiles: files.slice(index),
        };
    } catch {
      // The response may have been lost after the server wrote the file. Keep it for a retry,
      // while preserving every earlier response and pending version choice.
      return {
        actionResult: combineUploadResults(results),
        requestFailedFile: file.name,
        remainingFiles: files.slice(index),
      };
    }
  }
  return {
    actionResult: combineUploadResults(results),
    requestFailedFile: null,
    remainingFiles: [] as File[],
  };
};
