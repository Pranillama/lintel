import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtractDocumentFn, UploadedDocument } from "@/types/bill";

const srcDir = fileURLToPath(new URL("../../", import.meta.url));

// Node's type stripper does not read tsconfig paths. Map `@/` onto src/ for this process.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const rel = specifier.slice(2);
    const file = path.join(srcDir, rel.endsWith(".ts") ? rel : `${rel}.ts`);
    return nextResolve(pathToFileURL(file).href, context);
  },
});

const MEDIA: Record<string, UploadedDocument["media_type"]> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function isExtractModule(value: unknown): value is { extractDocument: ExtractDocumentFn } {
  return (
    typeof value === "object" &&
    value !== null &&
    "extractDocument" in value &&
    typeof value.extractDocument === "function"
  );
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npm run extract -- <path>");
  process.exitCode = 1;
} else {
  const mediaType = MEDIA[path.extname(filePath).toLowerCase()];
  if (!mediaType) {
    console.error("Unsupported file type. Use pdf, png, jpg, jpeg, or webp.");
    process.exitCode = 1;
  } else {
    try {
      const dataBase64 = readFileSync(filePath).toString("base64");
      const extractModule = "./extractDocument.ts";
      const loaded: unknown = await import(extractModule);
      if (!isExtractModule(loaded)) {
        console.error("Intake CLI could not load extractDocument.");
        process.exitCode = 1;
      } else {
        const bill = await loaded.extractDocument({
          filename: path.basename(filePath),
          media_type: mediaType,
          data_base64: dataBase64,
        });
        console.log(JSON.stringify(bill, null, 2));
      }
    } catch (err) {
      console.error(err instanceof Error ? err.message : "Could not read the file.");
      process.exitCode = 1;
    }
  }
}
