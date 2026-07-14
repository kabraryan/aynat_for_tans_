import { PDFDocument } from "pdf-lib";

/**
 * Multi-page PDF handling (spec 6.4). Documents up to CHUNK_THRESHOLD pages
 * go to the model whole; larger ones are split into CHUNK_SIZE-page chunks
 * with a 1-page overlap so items straddling a page boundary aren't lost
 * (the merge step dedupes the overlap).
 */
export const CHUNK_THRESHOLD = 25;
export const CHUNK_SIZE = 20;
const OVERLAP = 1;

/** 1-indexed inclusive page ranges covering the whole document. */
export function chunkRanges(pages: number): Array<[number, number]> {
  if (pages <= CHUNK_THRESHOLD) return [[1, pages]];
  const ranges: Array<[number, number]> = [];
  let start = 1;
  while (true) {
    const end = Math.min(start + CHUNK_SIZE - 1, pages);
    ranges.push([start, end]);
    if (end === pages) return ranges;
    start = end - OVERLAP + 1;
  }
}

export async function pageCount(bytes: Buffer): Promise<number> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  return doc.getPageCount();
}

/** Produce one standalone PDF per range. */
export async function splitPdf(
  bytes: Buffer,
  ranges: Array<[number, number]>,
): Promise<Buffer[]> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const chunks: Buffer[] = [];
  for (const [start, end] of ranges) {
    const chunk = await PDFDocument.create();
    const indices = Array.from({ length: end - start + 1 }, (_, i) => start - 1 + i);
    const pages = await chunk.copyPages(doc, indices);
    for (const page of pages) chunk.addPage(page);
    chunks.push(Buffer.from(await chunk.save()));
  }
  return chunks;
}
