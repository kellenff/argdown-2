import {
  GROUNDED_SOLVER_TAG,
  type CandidateArgument,
  type CandidateDocument,
  type CandidateElement,
  type CandidateInference,
  type CandidateRelation,
  type CandidateStatement,
} from '../model.js';
import { resolveInferenceRef, resolveRef } from './resolve-ref.js';
import type { ApplyResult, BuilderWarning, DocumentEdit } from './types.js';

export function emptyDocument(): CandidateDocument {
  return { solver: GROUNDED_SOLVER_TAG, elements: [] };
}

function stripColon(id: string): string {
  return id.startsWith(':') ? id.slice(1) : id;
}

function collectIds(doc: CandidateDocument): Set<string> {
  const ids = new Set<string>();
  for (const el of doc.elements) {
    if (el.kind === 'statement' || el.kind === 'argument') {
      ids.add(el.id);
      if (el.kind === 'argument') {
        for (const inf of el.inferences) {
          ids.add(inf.id);
        }
      }
    }
  }
  return ids;
}

function refused(doc: CandidateDocument, code: string, message: string): ApplyResult {
  return { document: doc, warnings: [], refused: { code, message }, diff: [] };
}

function resolveRefOrRaw(
  doc: CandidateDocument,
  raw: string,
  warnings: BuilderWarning[],
): string {
  const resolution = resolveRef(doc, raw);
  if (resolution.ok) {
    return resolution.id;
  }
  warnings.push({
    code: 'builder/unresolved-ref',
    message: resolution.message,
  });
  return stripColon(raw.trim());
}

function resolveInferenceRefOrRaw(
  doc: CandidateDocument,
  raw: string,
  warnings: BuilderWarning[],
): string {
  const resolution = resolveInferenceRef(doc, raw);
  if (resolution.ok) {
    return resolution.id;
  }
  warnings.push({
    code: 'builder/unresolved-ref',
    message: resolution.message,
  });
  return stripColon(raw.trim());
}

function resolveRelationEndpoint(
  doc: CandidateDocument,
  raw: string,
  warnings: BuilderWarning[],
  useInferenceRef: boolean,
): string {
  return useInferenceRef
    ? resolveInferenceRefOrRaw(doc, raw, warnings)
    : resolveRefOrRaw(doc, raw, warnings);
}

export function apply(doc: CandidateDocument, edit: DocumentEdit): ApplyResult {
  switch (edit.type) {
    case 'add_statement': {
      const id = stripColon(edit.id);
      if (collectIds(doc).has(id)) {
        return refused(doc, 'builder/duplicate-id', `Duplicate id "${id}"`);
      }
      const statement: CandidateStatement = {
        kind: 'statement',
        id,
        tags: edit.tags ? [...edit.tags] : [],
        extra: [],
        ...(edit.text !== undefined ? { text: edit.text } : {}),
      };
      return {
        document: { solver: doc.solver, elements: [...doc.elements, statement] },
        warnings: [],
        diff: [{ op: 'add', kind: 'statement', id }],
      };
    }

    case 'update_statement': {
      const id = stripColon(edit.id);
      const idx = doc.elements.findIndex((e) => e.kind === 'statement' && e.id === id);
      if (idx === -1) {
        return refused(doc, 'builder/missing-id', `No statement with id "${id}"`);
      }
      const existing = doc.elements[idx];
      if (existing === undefined || existing.kind !== 'statement') {
        return refused(doc, 'builder/missing-id', `No statement with id "${id}"`);
      }
      const updated: CandidateStatement = {
        ...existing,
        ...(edit.text !== undefined ? { text: edit.text } : {}),
        ...(edit.tags !== undefined ? { tags: [...edit.tags] } : {}),
      };
      const elements = [...doc.elements];
      elements[idx] = updated;
      return {
        document: { solver: doc.solver, elements },
        warnings: [],
        diff: [{ op: 'update', kind: 'statement', id }],
      };
    }

    case 'add_argument': {
      const id = stripColon(edit.id);
      if (collectIds(doc).has(id)) {
        return refused(doc, 'builder/duplicate-id', `Duplicate id "${id}"`);
      }
      const argument: CandidateArgument = {
        kind: 'argument',
        id,
        tags: edit.tags ? [...edit.tags] : [],
        inferences: [],
        extra: [],
        ...(edit.description !== undefined ? { description: edit.description } : {}),
      };
      return {
        document: { solver: doc.solver, elements: [...doc.elements, argument] },
        warnings: [],
        diff: [{ op: 'add', kind: 'argument', id }],
      };
    }

    case 'add_inference': {
      const argumentId = stripColon(edit.argumentId);
      const inferenceId = stripColon(edit.id);
      if (collectIds(doc).has(inferenceId)) {
        return refused(doc, 'builder/duplicate-id', `Duplicate id "${inferenceId}"`);
      }
      const argIdx = doc.elements.findIndex((e) => e.kind === 'argument' && e.id === argumentId);
      if (argIdx === -1) {
        return refused(doc, 'builder/missing-id', `No argument with id "${argumentId}"`);
      }
      const argEl = doc.elements[argIdx];
      if (argEl === undefined || argEl.kind !== 'argument') {
        return refused(doc, 'builder/missing-id', `No argument with id "${argumentId}"`);
      }
      const warnings: BuilderWarning[] = [];
      const premises = edit.premises.map((p) => resolveRefOrRaw(doc, p, warnings));
      const conclusion = resolveRefOrRaw(doc, edit.conclusion, warnings);
      const inference: CandidateInference = {
        kind: 'inference',
        id: inferenceId,
        premises,
        conclusion,
        rules: edit.rules ? [...edit.rules] : [],
        extra: [],
      };
      const updatedArg: CandidateArgument = {
        ...argEl,
        inferences: [...argEl.inferences, inference],
      };
      const elements: CandidateElement[] = [...doc.elements];
      elements[argIdx] = updatedArg;
      return {
        document: { solver: doc.solver, elements },
        warnings,
        diff: [{ op: 'add', kind: 'inference', id: inferenceId }],
      };
    }

    case 'add_relation': {
      const warnings: BuilderWarning[] = [];
      const from = resolveRefOrRaw(doc, edit.from, warnings);
      const to = resolveRelationEndpoint(
        doc,
        edit.to,
        warnings,
        edit.kind === 'undercut',
      );
      const relation: CandidateRelation = {
        kind: edit.kind,
        from,
        to,
        extra: [],
      };
      return {
        document: { solver: doc.solver, elements: [...doc.elements, relation] },
        warnings,
        diff: [{ op: 'add-relation', kind: edit.kind, from, to }],
      };
    }

    case 'remove_element': {
      const id = stripColon(edit.id);

      const stmtIdx = doc.elements.findIndex((e) => e.kind === 'statement' && e.id === id);
      if (stmtIdx !== -1) {
        const elements = doc.elements.filter((_, i) => i !== stmtIdx);
        return {
          document: { solver: doc.solver, elements },
          warnings: [],
          diff: [{ op: 'remove', kind: 'statement', id }],
        };
      }

      const argIdx = doc.elements.findIndex((e) => e.kind === 'argument' && e.id === id);
      if (argIdx !== -1) {
        const elements = doc.elements.filter((_, i) => i !== argIdx);
        return {
          document: { solver: doc.solver, elements },
          warnings: [],
          diff: [{ op: 'remove', kind: 'argument', id }],
        };
      }

      for (let i = 0; i < doc.elements.length; i++) {
        const el = doc.elements[i];
        if (el === undefined || el.kind !== 'argument') continue;
        const infIdx = el.inferences.findIndex((inf) => inf.id === id);
        if (infIdx === -1) continue;
        const updatedArg: CandidateArgument = {
          ...el,
          inferences: el.inferences.filter((inf) => inf.id !== id),
        };
        const elements: CandidateElement[] = [...doc.elements];
        elements[i] = updatedArg;
        return {
          document: { solver: doc.solver, elements },
          warnings: [],
          diff: [{ op: 'remove', kind: 'inference', id }],
        };
      }

      return refused(doc, 'builder/missing-id', `No element with id "${id}"`);
    }

    case 'remove_relation': {
      const warnings: BuilderWarning[] = [];
      const from = resolveRefOrRaw(doc, edit.from, warnings);
      const to = resolveRelationEndpoint(
        doc,
        edit.to,
        warnings,
        edit.kind === 'undercut',
      );
      const relIdx = doc.elements.findIndex(
        (e) =>
          (e.kind === 'support' ||
            e.kind === 'attack' ||
            e.kind === 'contradiction' ||
            e.kind === 'undercut') &&
          e.kind === edit.kind &&
          e.from === from &&
          e.to === to,
      );
      if (relIdx === -1) {
        return refused(
          doc,
          'builder/missing-id',
          `No ${edit.kind} relation from "${from}" to "${to}"`,
        );
      }
      const elements = doc.elements.filter((_, i) => i !== relIdx);
      return {
        document: { solver: doc.solver, elements },
        warnings,
        diff: [{ op: 'remove-relation', kind: edit.kind, from, to }],
      };
    }

    default: {
      const _exhaustive: never = edit;
      return refused(doc, 'builder/unsupported-edit', 'Unknown edit type');
    }
  }
}
