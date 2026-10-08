import { readFile } from "node:fs/promises";

import { PSM, createWorker } from "tesseract.js";
import {
  createIsomorphicCanvasFactory,
  definePDFJSModule,
  extractText,
  getDocumentProxy,
  renderPageAsImage,
} from "unpdf";

export class PdfExtractionError extends Error {
  constructor(
    public readonly code:
      | "pdfReadFailed"
      | "pdfHasNoTextLayer"
      | "pdfOcrFailed"
      | "pdfOcrUnavailable",
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "PdfExtractionError";
  }
}

let pdfJsSetupPromise: Promise<void> | null = null;

const ensurePdfJsSetup = async () => {
  pdfJsSetupPromise ??= definePDFJSModule(() => import("pdfjs-dist/legacy/build/pdf.mjs"));
  await pdfJsSetupPromise;
};

export const extractPdfText = async (filePath: string): Promise<string> => {
  try {
    await ensurePdfJsSetup();

    const buffer = await readFile(filePath);
    const binary = new Uint8Array(buffer);
    // PDF.js transfers this buffer to its worker; keep the original bytes available for OCR.
    const pdf = await getDocumentProxy(binary.slice());
    try {
      const { text } = await extractText(pdf, { mergePages: false });
      const pages = text.map((page) => page.replace(/\r/g, "").trim());
      const scannedPages = pages.flatMap((page, index) => (page ? [] : [index + 1]));
      if (scannedPages.length > 0) {
        const ocrPages = await extractPdfTextWithOcr(binary, scannedPages);
        for (const [pageNumber, pageText] of ocrPages) pages[pageNumber - 1] = pageText;
      }
      const normalizedText = pages.join("\n\n").trim();
      if (!normalizedText) {
        throw new PdfExtractionError("pdfHasNoTextLayer", "PDF text layer is empty.");
      }
      return normalizedText;
    } finally {
      await pdf.destroy();
    }
  } catch (error) {
    if (error instanceof PdfExtractionError) {
      throw error;
    }

    throw new PdfExtractionError(
      "pdfReadFailed",
      "Failed to extract text from PDF.",
      error instanceof Error ? error.message : undefined,
    );
  }
};

const extractPdfTextWithOcr = async (
  binary: Uint8Array,
  pageNumbers: number[],
): Promise<Map<number, string>> => {
  try {
    const worker = await createWorker(["ukr", "rus", "eng"]);

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
      });

      const pages = new Map<number, string>();
      const canvasImport = () => import("@napi-rs/canvas");
      const CanvasFactory = await createIsomorphicCanvasFactory(canvasImport);
      const ocrPdf = await getDocumentProxy(binary.slice(), { CanvasFactory });
      try {
        for (const pageNumber of pageNumbers) {
          const image = await renderPageAsImage(ocrPdf, pageNumber, { scale: 2, canvasImport });
          const result = await worker.recognize(Buffer.from(image));
          const pageText = result.data.text.replace(/\r/g, "").trim();
          pages.set(pageNumber, pageText);
        }
      } finally {
        await ocrPdf.destroy();
      }

      return pages;
    } finally {
      await worker.terminate();
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("fetch") || error.message.includes("lang")) {
        throw new PdfExtractionError(
          "pdfOcrUnavailable",
          "OCR language data is unavailable.",
          error.message,
        );
      }

      throw new PdfExtractionError("pdfOcrFailed", "OCR fallback failed.", error.message);
    }

    throw new PdfExtractionError("pdfOcrFailed", "OCR fallback failed.");
  }
};
