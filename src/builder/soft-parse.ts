import { Effect } from "effect";

import { readEdn } from "../edn.js";
import type { CandidateDocument, Diagnostic } from "../model.js";
import { decodeWire } from "../schema.js";

export type SoftParseResult =
  | { ok: true; document: CandidateDocument }
  | { ok: false; errors: readonly Diagnostic[] };

export function softParse(source: string): SoftParseResult {
  return Effect.runSync(
    Effect.match(readEdn(source), {
      onFailure: (err) => ({ ok: false, errors: [err.diagnostic] }),
      onSuccess: (value) => decodeWire(value),
    }),
  );
}
