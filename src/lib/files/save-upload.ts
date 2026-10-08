import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const uploadDirectory = path.join(process.cwd(), "storage", "uploads");

const sanitizeFilename = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");

export const saveUploadedFile = async (file: File): Promise<string> => {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const id = randomUUID();
  const sanitized = sanitizeFilename(file.name);
  const originalExtension = path.extname(sanitized);
  const extension = originalExtension.slice(0, 32);
  // Sanitization leaves ASCII only, so characters equal bytes for the 255-byte limit.
  const stem = sanitized
    .slice(0, sanitized.length - originalExtension.length)
    .slice(0, 255 - id.length - 1 - extension.length);
  const safeName = `${id}-${stem}${extension}`;

  await mkdir(uploadDirectory, { recursive: true });

  const filePath = path.join(uploadDirectory, safeName);
  await writeFile(filePath, buffer, { flag: "wx" });

  return filePath;
};
