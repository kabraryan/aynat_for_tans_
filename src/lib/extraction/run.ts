// Pure extraction runner — no DB, no Next.js imports. Used by both
// extractFromSource and the fixture eval script (which runs outside Next,
// so keep every import in this chain relative and framework-free).
import { ExtractionResult, type ExtractionResultT } from "./schema";
import type { ExtractionBackend, ExtractionInput } from "./backends";

/** Parse + validate the backend's raw text; one corrective retry on failure. */
export async function runValidated(
  backend: ExtractionBackend,
  input: ExtractionInput,
): Promise<ExtractionResultT> {
  const first = await backend.extract(input);
  const parsed = tryParse(first);
  if (parsed.ok) return parsed.value;

  const second = await backend.extract({ ...input, correction: parsed.error });
  const reparsed = tryParse(second);
  if (reparsed.ok) return reparsed.value;
  throw new Error(`extraction output failed validation twice: ${reparsed.error}`);
}

export function tryParse(
  raw: string,
): { ok: true; value: ExtractionResultT } | { ok: false; error: string } {
  // tolerate fences/prose: take the outermost JSON object
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { ok: false, error: "no JSON object found in response" };
  let json: unknown;
  try {
    json = JSON.parse(raw.slice(start, end + 1));
  } catch (e) {
    return { ok: false, error: `invalid JSON: ${String(e)}` };
  }
  const result = ExtractionResult.safeParse(json);
  if (!result.success) {
    return { ok: false, error: JSON.stringify(result.error.issues).slice(0, 1500) };
  }
  return { ok: true, value: result.data };
}
