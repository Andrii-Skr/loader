import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  extract: vi.fn(),
  render: vi.fn(),
  createWorker: vi.fn(),
  recognize: vi.fn(),
  setParameters: vi.fn(),
  terminate: vi.fn(),
  destroy: vi.fn(),
  ocrDestroy: vi.fn(),
  getProxy: vi.fn(),
}));
vi.mock("node:fs/promises", () => ({ readFile: vi.fn(async () => Buffer.from("pdf")) }));
vi.mock("unpdf", () => ({
  definePDFJSModule: vi.fn(async () => {}),
  getDocumentProxy: mocks.getProxy,
  createIsomorphicCanvasFactory: vi.fn(async () => class {}),
  extractText: mocks.extract,
  renderPageAsImage: mocks.render,
}));
vi.mock("tesseract.js", () => ({ PSM: { AUTO: 3 }, createWorker: mocks.createWorker }));
import { extractPdfText } from "./extract-pdf-text";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getProxy
    .mockResolvedValueOnce({ numPages: 3, destroy: mocks.destroy })
    .mockResolvedValue({ numPages: 3, destroy: mocks.ocrDestroy });
  mocks.extract.mockResolvedValue({ text: ["Header", "", "Footer"] });
  mocks.render.mockResolvedValue(new Uint8Array([1]));
  mocks.recognize.mockResolvedValue({ data: { text: "Scanned table" } });
  mocks.createWorker.mockResolvedValue({
    recognize: mocks.recognize,
    setParameters: mocks.setParameters,
    terminate: mocks.terminate,
  });
});
it("OCRs only the scanned page and preserves the surrounding text in page order", async () => {
  expect(await extractPdfText("mixed.pdf")).toBe("Header\n\nScanned table\n\nFooter");
  expect(mocks.render).toHaveBeenCalledTimes(1);
  expect(mocks.render).toHaveBeenCalledWith(
    expect.objectContaining({ destroy: mocks.ocrDestroy }),
    2,
    expect.any(Object),
  );
  expect(mocks.terminate).toHaveBeenCalledTimes(1);
  expect(mocks.destroy).toHaveBeenCalledTimes(1);
  expect(mocks.ocrDestroy).toHaveBeenCalledTimes(1);
});
it("does not start OCR when all pages have a text layer", async () => {
  mocks.extract.mockResolvedValue({ text: ["Page 1", "Page 2"] });
  expect(await extractPdfText("text.pdf")).toBe("Page 1\n\nPage 2");
  expect(mocks.createWorker).not.toHaveBeenCalled();
});
it("uses one worker for all scanned pages", async () => {
  mocks.extract.mockResolvedValue({ text: ["", "  ", ""] });
  mocks.recognize
    .mockResolvedValueOnce({ data: { text: "One" } })
    .mockResolvedValueOnce({ data: { text: "Two" } })
    .mockResolvedValueOnce({ data: { text: "Three" } });
  expect(await extractPdfText("scanned.pdf")).toBe("One\n\nTwo\n\nThree");
  expect(mocks.createWorker).toHaveBeenCalledTimes(1);
  expect(mocks.render.mock.calls.map((call) => call[1])).toEqual([1, 2, 3]);
});
it("reports an unreadable document when OCR also finds no text", async () => {
  mocks.extract.mockResolvedValue({ text: [""] });
  mocks.recognize.mockResolvedValue({ data: { text: "  " } });
  await expect(extractPdfText("empty.pdf")).rejects.toMatchObject({ code: "pdfHasNoTextLayer" });
});
it("reports a mixed-document OCR failure and releases both worker and PDF", async () => {
  mocks.recognize.mockRejectedValue(new Error("recognition failed"));
  await expect(extractPdfText("mixed.pdf")).rejects.toMatchObject({ code: "pdfOcrFailed" });
  expect(mocks.terminate).toHaveBeenCalledTimes(1);
  expect(mocks.destroy).toHaveBeenCalledTimes(1);
});
it("preserves the unavailable-language error for scanned pages", async () => {
  mocks.createWorker.mockRejectedValue(new Error("fetch language failed"));
  await expect(extractPdfText("mixed.pdf")).rejects.toMatchObject({ code: "pdfOcrUnavailable" });
  expect(mocks.destroy).toHaveBeenCalledTimes(1);
});

it("keeps bytes available for OCR after PDF.js transfers the first buffer", async () => {
  mocks.getProxy.mockReset();
  mocks.getProxy
    .mockImplementationOnce(async (data: Uint8Array) => {
      structuredClone(data.buffer, { transfer: [data.buffer] });
      return { numPages: 3, destroy: mocks.destroy };
    })
    .mockResolvedValue({ numPages: 3, destroy: mocks.ocrDestroy });
  expect(await extractPdfText("mixed.pdf")).toBe("Header\n\nScanned table\n\nFooter");
  expect(mocks.getProxy.mock.calls[1][0]).toEqual(new Uint8Array(Buffer.from("pdf")));
  expect(mocks.ocrDestroy).toHaveBeenCalledTimes(1);
});
