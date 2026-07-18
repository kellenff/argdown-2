import { ednParseMulti } from 'edn-parser-js';

import type { Diagnostic, ReadResult } from './model.js';

function rootCountFailure(): ReadResult {
  return {
    ok: false,
    errors: [
      {
        code: 'edn/root-count',
        message: 'Expected exactly one top-level EDN value',
      },
    ],
  };
}

function readFailure(error: unknown): ReadResult {
  const message = error instanceof Error ? error.message : String(error);
  const diagnostic: Diagnostic = {
    code: 'edn/read-error',
    message,
  };
  return { ok: false, errors: [diagnostic] };
}

export function readEdn(source: string): ReadResult {
  try {
    const forms = ednParseMulti(source);
    if (forms.length !== 1) return rootCountFailure();
    const value = forms[0];
    if (value === undefined) return rootCountFailure();
    return { ok: true, value };
  } catch (error: unknown) {
    return readFailure(error);
  }
}
