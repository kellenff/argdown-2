import { readEdn } from "./edn.js";
import { groundedLabels } from "./grounded.js";
import type {
  GroundedDocument,
  LabelSolverTag,
  LoadResult,
  MultiExtensionSolverTag,
  MultiSolveResult,
  SolveResult,
  ValidationResult,
} from "./model.js";
import {
  BIPOLAR_SOLVER_TAG,
  COMPLETE_SOLVER_TAG,
  GROUNDED_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  STABLE_SOLVER_TAG,
} from "./model.js";
import {
  findCompleteExtensions,
  findPreferredExtensions,
  findStableExtensions,
  frameworkToAttackMap,
} from "./multi-extension.js";
import { reduceToBipolar } from "./reduce-bipolar.js";
import { reduceToDung } from "./reduce-dung.js";
import { decodeWire } from "./schema.js";
import { validateCandidate } from "./validate.js";

export type {
  Argument,
  Diagnostic,
  DungFramework,
  EntityId,
  GroundedDocument,
  Inference,
  InferenceId,
  Label,
  LoadResult,
  MultiSolveResult,
  Relation,
  SolveResult,
  SolverTag,
  Statement,
  TheoryElement,
  ValidationResult,
} from "./model.js";

export {
  BIPOLAR_SOLVER_TAG,
  COMPLETE_SOLVER_TAG,
  GROUNDED_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  SOLVER_TAGS,
  STABLE_SOLVER_TAG,
} from "./model.js";

export function validate(value: unknown): ValidationResult {
  const decoded = decodeWire(value);
  return decoded.ok ? validateCandidate(decoded.document) : decoded;
}

export function load(source: string): LoadResult {
  const read = readEdn(source);
  return read.ok ? validate(read.value) : read;
}

function solveLabels(
  document: GroundedDocument,
  solver: LabelSolverTag,
  reduce: typeof reduceToDung | typeof reduceToBipolar,
): SolveResult {
  const reduced = reduce(document);
  return {
    labels: groundedLabels(reduced.framework),
    solver,
    warnings: reduced.warnings,
  };
}

function solveMultiExtension(
  document: GroundedDocument,
  solver: MultiExtensionSolverTag,
  findExtensions:
    | typeof findCompleteExtensions
    | typeof findPreferredExtensions
    | typeof findStableExtensions,
): MultiSolveResult {
  const reduced = reduceToDung(document);
  const extensions = findExtensions(frameworkToAttackMap(reduced.framework));
  return { extensions, solver, warnings: reduced.warnings };
}

export function solve(
  document: GroundedDocument,
): MultiSolveResult | SolveResult {
  switch (document.solver) {
    case GROUNDED_SOLVER_TAG:
      return solveLabels(document, GROUNDED_SOLVER_TAG, reduceToDung);
    case BIPOLAR_SOLVER_TAG:
      return solveLabels(document, BIPOLAR_SOLVER_TAG, reduceToBipolar);
    case PREFERRED_SOLVER_TAG:
      return solveMultiExtension(
        document,
        PREFERRED_SOLVER_TAG,
        findPreferredExtensions,
      );
    case STABLE_SOLVER_TAG:
      return solveMultiExtension(
        document,
        STABLE_SOLVER_TAG,
        findStableExtensions,
      );
    case COMPLETE_SOLVER_TAG:
      return solveMultiExtension(
        document,
        COMPLETE_SOLVER_TAG,
        findCompleteExtensions,
      );
  }
}
