import { Effect } from "effect";

import { readEdn } from "../edn.js";
import type { CandidateDocument, EdnError, SchemaError } from "../model.js";
import { decodeWire } from "../schema.js";

export type ParseCandidateError = EdnError | SchemaError;

export function parseCandidate(
  source: string,
): Effect.Effect<CandidateDocument, ParseCandidateError, never> {
  return Effect.gen(function* () {
    const raw = yield* readEdn(source);
    return yield* decodeWire(raw);
  });
}
