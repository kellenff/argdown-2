import { readEdn } from "../edn.js";
import type { CandidateDocument, Diagnostic } from "../model.js";
import { decodeWire } from "../schema.js";

export type SoftParseResult =
  | { ok: true; document: CandidateDocument }
  | { ok: false; errors: readonly Diagnostic[] };

export function softParse(source: string): SoftParseResult {
  const read = readEdn(source);
  if (!read.ok) return read;
  return decodeWire(read.value);
}
