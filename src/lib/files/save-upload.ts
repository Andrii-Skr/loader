import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const uploadDirectory = path.join(process.cwd(), "storage", "uploads");

const sanitizeFilename = (value: string): string =>
  value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");

export const saveUploadedFile = async (file: File): Promise<string> => {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const safeName = `${Date.now()}-${sanitizeFilename(file.name)}`;

  await mkdir(uploadDirectory, { recursive: true });

  const filePath = path.join(uploadDirectory, safeName);
  await writeFile(filePath, buffer);

  return filePath;
};
