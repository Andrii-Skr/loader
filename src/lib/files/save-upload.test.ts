import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";

it("preserves concurrent uploads with identical names and timestamps", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "loader-upload-test-"));
  const clock = vi.spyOn(Date, "now").mockReturnValue(123456789);
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(directory);

  try {
    vi.resetModules();
    const { saveUploadedFile } = await import("./save-upload");
    cwd.mockRestore();
    const [first, second] = await Promise.all([
      saveUploadedFile(new File(["first invoice"], "invoice.pdf")),
      saveUploadedFile(new File(["second invoice"], "invoice.pdf")),
    ]);

    expect(first).not.toBe(second);
    expect(await readFile(first, "utf8")).toBe("first invoice");
    expect(await readFile(second, "utf8")).toBe("second invoice");
  } finally {
    cwd.mockRestore();
    clock.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});

it("stores a long filename within the filesystem limit without truncating file content", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "loader-upload-long-test-"));
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(directory);
  try {
    vi.resetModules();
    const { saveUploadedFile } = await import("./save-upload");
    cwd.mockRestore();
    const file = new File(["original PDF content"], `${"a".repeat(230)}.pdf`);
    const stored = await saveUploadedFile(file);
    expect(Buffer.byteLength(path.basename(stored))).toBeLessThanOrEqual(255);
    expect(stored.endsWith(".pdf")).toBe(true);
    expect(await readFile(stored, "utf8")).toBe("original PDF content");
    expect(file.name).toBe(`${"a".repeat(230)}.pdf`);
  } finally {
    cwd.mockRestore();
    await rm(directory, { recursive: true, force: true });
  }
});
