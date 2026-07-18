import type { CandidateDocument } from '../model.js';

import type { RefResolution } from './types.js';

function stripKeywordColon(raw: string): string {
  return raw.startsWith(':') ? raw.slice(1) : raw;
}

export function resolveRef(doc: CandidateDocument, idOrText: string): RefResolution {
  const needle = stripKeywordColon(idOrText.trim());
  if (needle.length === 0) {
    return { ok: false, reason: 'missing', message: 'Empty reference' };
  }

  for (const el of doc.elements) {
    if (el.kind === 'statement' || el.kind === 'argument') {
      if (el.id === needle) return { ok: true, id: el.id, via: 'id' };
    }
  }

  const textHits: string[] = [];
  for (const el of doc.elements) {
    if (el.kind === 'statement' && el.text === needle) textHits.push(el.id);
    if (el.kind === 'argument' && el.description === needle) textHits.push(el.id);
  }
  if (textHits.length === 1) {
    const id = textHits[0];
    if (id === undefined) {
      return { ok: false, reason: 'missing', message: `No entity matches "${needle}"` };
    }
    return { ok: true, id, via: 'text' };
  }
  if (textHits.length > 1) {
    return {
      ok: false,
      reason: 'ambiguous',
      message: `Ambiguous text "${needle}" matches ids: ${textHits.join(', ')}`,
    };
  }
  return { ok: false, reason: 'missing', message: `No entity matches "${needle}"` };
}

/** Resolve an inference id (id-only; text lookup is not used for inferences). */
export function resolveInferenceRef(
  doc: CandidateDocument,
  idOrText: string,
): RefResolution {
  const needle = stripKeywordColon(idOrText.trim());
  for (const el of doc.elements) {
    if (el.kind !== 'argument') continue;
    for (const inf of el.inferences) {
      if (inf.id === needle) return { ok: true, id: inf.id, via: 'id' };
    }
  }
  return {
    ok: false,
    reason: 'missing',
    message: `No inference matches "${needle}"`,
  };
}
