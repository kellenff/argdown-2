import { groundedLabels } from "./grounded.js";
import {
  findCompleteExtensions,
  findPreferredExtensions,
  findStableExtensions,
  frameworkToAttackMap,
} from "./multi-extension.js";
import type {
  ComponentSolveResult,
  Confidence,
  EntityId,
  Label,
  SolverComponent,
  ThresholdProjection,
} from "./model.js";
import {
  BIPOLAR_SOLVER_TAG,
  COMPLETE_SOLVER_TAG,
  EVIDENTIAL_SOLVER_TAG,
  GROUNDED_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  STABLE_SOLVER_TAG,
} from "./model.js";
import { reduceToBipolar } from "./reduce-bipolar.js";
import { isSyntheticEntity, reduceToDung } from "./reduce-dung.js";
import { reduceToEvidential } from "./reduce-evidential.js";

export function confidenceFromLabel(label: Label): Confidence {
  if (label === "in") return 1;
  if (label === "out") return 0;
  return null;
}

export function applyThreshold(
  confidence: Confidence,
  projection: ThresholdProjection,
): Confidence {
  if (confidence === null) return null;
  if (confidence <= projection.outAtMost) return 0;
  if (confidence >= projection.inAtLeast) return 1;
  return null;
}

function visibleLabels(
  labels: ReadonlyMap<EntityId, Label>,
): ReadonlyMap<EntityId, Label> {
  return new Map([...labels].filter(([id]) => !isSyntheticEntity(id)));
}

function childComponents(
  component: SolverComponent,
): readonly SolverComponent[] {
  return component.elements.filter(
    (element): element is SolverComponent => element.kind === "solver",
  );
}

function evaluateLabelComponent(
  component: SolverComponent,
  children: ReadonlyMap<EntityId, ComponentSolveResult>,
): ComponentSolveResult {
  const childBoundaries = new Map<EntityId, Confidence>();
  for (const [id, result] of children) {
    const projection = component.imports.get(id);
    childBoundaries.set(
      id,
      projection === undefined
        ? result.boundary.confidence
        : applyThreshold(result.boundary.confidence, projection),
    );
  }
  const reduced = component.solver === GROUNDED_SOLVER_TAG
    ? reduceToDung(component, childBoundaries)
    : component.solver === BIPOLAR_SOLVER_TAG
    ? reduceToBipolar(component)
    : reduceToEvidential(component);
  const labels = visibleLabels(groundedLabels(reduced.framework));
  const ref = component.interface.aggregate.inputs[0].ref as EntityId;
  const value = labels.get(ref);
  if (value === undefined) {
    throw new Error(`Validated interface ref :${ref} has no native label`);
  }
  return {
    id: component.id,
    solver: component.solver,
    native: { kind: "labels", values: labels },
    aggregate: { kind: "label", value },
    boundary: { confidence: confidenceFromLabel(value) },
    children,
    warnings: reduced.warnings,
  };
}

function evaluateMultiComponent(
  component: SolverComponent,
  children: ReadonlyMap<EntityId, ComponentSolveResult>,
): ComponentSolveResult {
  const reduced = reduceToDung(component);
  const map = frameworkToAttackMap(reduced.framework);
  const extensions = component.solver === PREFERRED_SOLVER_TAG
    ? findPreferredExtensions(map)
    : component.solver === STABLE_SOLVER_TAG
    ? findStableExtensions(map)
    : findCompleteExtensions(map);
  const ref = component.interface.aggregate.inputs[0].ref as EntityId;
  const confidence = extensions.length === 0
    ? null
    : extensions.filter((extension) => extension.has(ref)).length /
      extensions.length;
  return {
    id: component.id,
    solver: component.solver,
    native: { kind: "extensions", values: extensions },
    aggregate: { kind: "extension-proportion", value: confidence },
    boundary: { confidence },
    children,
    warnings: reduced.warnings,
  };
}

export function evaluateComponent(
  component: SolverComponent,
): ComponentSolveResult {
  const children = new Map<EntityId, ComponentSolveResult>();
  for (const child of childComponents(component)) {
    children.set(child.id, evaluateComponent(child));
  }
  switch (component.solver) {
    case GROUNDED_SOLVER_TAG:
    case BIPOLAR_SOLVER_TAG:
    case EVIDENTIAL_SOLVER_TAG:
      return evaluateLabelComponent(component, children);
    case PREFERRED_SOLVER_TAG:
    case STABLE_SOLVER_TAG:
    case COMPLETE_SOLVER_TAG:
      return evaluateMultiComponent(component, children);
  }
}
