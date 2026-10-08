import type { UploadInvoiceActionResult } from "@/app/actions/documents";
import { expect, it, vi } from "vitest";
import { uploadDocumentBatch } from "./upload-batch";

const files = ["one.pdf", "two.pdf", "three.pdf"].map((name) => new File(["pdf"], name));
const version = {
  id: 1,
  sourceFileName: "one.pdf",
  documentNumber: "1",
  documentDate: "2026-01-01",
  supplierName: null,
  recipientName: null,
  totalAmount: "1",
  currency: "UAH",
  revision: 1,
};
const success: UploadInvoiceActionResult = {
  errorKey: null,
  successCount: 1,
  failedCount: 0,
  duplicateCount: 0,
  replacementCount: 1,
  results: [
    {
      fileName: "one.pdf",
      errorKey: null,
      versionSelection: { previous: version, uploaded: { ...version, id: 2, revision: 2 } },
    },
  ],
};
it("keeps previous successes and version choices when the next request fails", async () => {
  const upload = vi
    .fn()
    .mockResolvedValueOnce(success)
    .mockRejectedValueOnce(new Error("Lost response"));
  const result = await uploadDocumentBatch(files, upload);
  expect(result.actionResult.successCount).toBe(1);
  expect(result.actionResult.results[0]?.versionSelection).toEqual(
    success.results[0]?.versionSelection,
  );
  expect(result.requestFailedFile).toBe("two.pdf");
  expect(result.remainingFiles).toEqual(files.slice(1));
  expect(upload).toHaveBeenCalledTimes(2);
});
it("preserves results when a later request returns a session error", async () => {
  const upload = vi
    .fn()
    .mockResolvedValueOnce(success)
    .mockResolvedValueOnce({
      ...success,
      errorKey: "missingSession",
      successCount: 0,
      replacementCount: 0,
      results: [],
    });
  const result = await uploadDocumentBatch(files, upload);
  expect(result.actionResult.errorKey).toBe("missingSession");
  expect(result.actionResult.successCount).toBe(1);
  expect(result.actionResult.results).toEqual(success.results);
  expect(result.remainingFiles).toEqual(files.slice(1));
});
it("leaves all files available for retry if the first request fails", async () => {
  const result = await uploadDocumentBatch(
    files,
    vi.fn().mockRejectedValue(new Error("Unavailable")),
  );
  expect(result.actionResult.results).toEqual([]);
  expect(result.remainingFiles).toEqual(files);
});
it("combines responses and empties the retry list after all uploads finish", async () => {
  const upload = vi.fn().mockResolvedValue(success);
  const result = await uploadDocumentBatch(files, upload);
  expect(result.actionResult.successCount).toBe(3);
  expect(result.actionResult.results).toHaveLength(3);
  expect(result.remainingFiles).toEqual([]);
  expect(result.requestFailedFile).toBeNull();
});
