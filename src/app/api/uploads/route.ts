import { NextResponse } from "next/server";
import { after } from "next/server";
import { db } from "@/lib/db";
import { jsonError, requireUserId } from "@/lib/api";
import { storage } from "@/lib/storage";
import { extractFromSource } from "@/lib/extraction";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "application/pdf"]);
const MAX_BYTES = 15 * 1024 * 1024; // spec 6.3

export async function POST(req: Request) {
  const auth = await requireUserId();
  if ("response" in auth) return auth.response;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError(400, "invalid_form", "Expected multipart form data");
  }
  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "missing_file", "No file provided");
  if (!ALLOWED_MIME.has(file.type))
    return jsonError(400, "unsupported_type", "Only png, jpg, webp, or pdf files are accepted");
  if (file.size > MAX_BYTES)
    return jsonError(400, "too_large", "Files are limited to 15 MB");

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileKey = await storage.put(bytes, { originalName: file.name || "pasted-image" });

  const source = await db.source.create({
    data: {
      userId: auth.userId,
      type: "UPLOAD",
      fileKey,
      mimeType: file.type,
      originalName: file.name || "pasted-image",
    },
  });

  // extraction runs after the response is sent; the client polls source status
  after(async () => {
    try {
      await extractFromSource(source.id);
    } catch (err) {
      console.error(`extraction failed for source ${source.id}:`, err);
    }
  });

  return NextResponse.json(source, { status: 201 });
}
