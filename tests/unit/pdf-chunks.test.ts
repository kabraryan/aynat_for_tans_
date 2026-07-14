import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { chunkRanges, pageCount, splitPdf } from "@/lib/extraction/pdf";

describe("chunkRanges", () => {
  it("keeps small documents whole (≤ 25 pages)", () => {
    expect(chunkRanges(1)).toEqual([[1, 1]]);
    expect(chunkRanges(10)).toEqual([[1, 10]]);
    expect(chunkRanges(25)).toEqual([[1, 25]]);
  });

  it("splits larger documents into 20-page chunks with 1-page overlap", () => {
    // 26 pages: [1..20], [20..26]
    expect(chunkRanges(26)).toEqual([
      [1, 20],
      [20, 26],
    ]);
  });

  it("chains overlaps across many chunks and never loses a page", () => {
    const ranges = chunkRanges(60);
    expect(ranges).toEqual([
      [1, 20],
      [20, 39],
      [39, 58],
      [58, 60],
    ]);
    // coverage: every page 1..60 appears in some range
    const covered = new Set<number>();
    for (const [a, b] of ranges) for (let p = a; p <= b; p++) covered.add(p);
    expect(covered.size).toBe(60);
  });
});

describe("pageCount + splitPdf", () => {
  async function makePdf(pages: number): Promise<Buffer> {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage();
    return Buffer.from(await doc.save());
  }

  it("counts pages", async () => {
    expect(await pageCount(await makePdf(7))).toBe(7);
  });

  it("splits along ranges into standalone PDFs with the right page counts", async () => {
    const bytes = await makePdf(30);
    const chunks = await splitPdf(bytes, chunkRanges(30)); // [1,20],[20,30]
    expect(chunks).toHaveLength(2);
    expect(await pageCount(chunks[0])).toBe(20);
    expect(await pageCount(chunks[1])).toBe(11); // pages 20..30 inclusive
  });
});
