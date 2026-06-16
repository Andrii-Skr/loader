import { readFile } from "node:fs/promises";

import { PSM, createWorker } from "tesseract.js";
import { definePDFJSModule, extractText, getDocumentProxy, renderPageAsImage } from "unpdf";

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
    const pdf = await getDocumentProxy(binary);
    const { text } = await extractText(pdf, { mergePages: true });
    const normalizedText = text.replace(/\r/g, "").trim();

    if (!normalizedText) {
      const ocrText = await extractPdfTextWithOcr(binary, pdf.numPages);

      if (!ocrText) {
        throw new PdfExtractionError("pdfHasNoTextLayer", "PDF text layer is empty.");
      }

      return ocrText;
    }

    return normalizedText;
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

const extractPdfTextWithOcr = async (binary: Uint8Array, totalPages: number): Promise<string> => {
  try {
    const worker = await createWorker(["ukr", "rus", "eng"]);

    try {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: "1",
      });

      const pages: string[] = [];

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        const image = await renderPageAsImage(binary, pageNumber, {
          scale: 2,
          canvasImport: () => import("@napi-rs/canvas"),
        });
        const result = await worker.recognize(Buffer.from(image));
        const pageText = result.data.text.replace(/\r/g, "").trim();

        if (pageText) {
          pages.push(pageText);
        }
      }

      return pages.join("\n\n").trim();
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
