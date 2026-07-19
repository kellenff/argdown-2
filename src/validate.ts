import type {
  Argument,
  CandidateArgument,
  CandidateDocument,
  CandidateInference,
  CandidateRelation,
  CandidateSolverComponent,
  CandidateStatement,
  Diagnostic,
  Document,
  EntityId,
  Inference,
  InferenceId,
  Relation,
  SolverComponent,
  Statement,
  TheoryElement,
  ValidationResult,
} from "./model.js";
import {
  COMPLETE_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  STABLE_SOLVER_TAG,
} from "./model.js";

type EndpointKind =
  | "argument"
  | "child-solver"
  | "inference"
  | "relation"
  | "statement";

type Path = readonly (number | string)[];

function entityId(value: string): EntityId {
  return value as EntityId;
}

function inferenceId(value: string): InferenceId {
  return value as InferenceId;
}

function addEndpoint(
  endpoints: Map<string, EndpointKind>,
  id: string,
  kind: EndpointKind,
  path: Path,
  errors: Diagnostic[],
): void {
  if (endpoints.has(id)) {
    errors.push({
      code: "semantic/duplicate-id",
      message: `Duplicate id :${id}`,
      path,
    });
    return;
  }
  endpoints.set(id, kind);
}

function collectEndpoints(
  component: CandidateSolverComponent,
  path: Path,
  errors: Diagnostic[],
): ReadonlyMap<string, EndpointKind> {
  const endpoints = new Map<string, EndpointKind>();
  component.elements.forEach((element, index) => {
    const elementPath = [...path, ":elements", index];
    if (element.kind === "solver") {
      addEndpoint(
        endpoints,
        element.id,
        "child-solver",
        [...elementPath, ":id"],
        errors,
      );
      return;
    }
    addEndpoint(
      endpoints,
      element.id,
      element.kind === "statement" || element.kind === "argument"
        ? element.kind
        : "relation",
      [...elementPath, ":id"],
      errors,
    );
    if (element.kind === "argument") {
      element.inferences.forEach((inference, inferenceIndex) => {
        addEndpoint(
          endpoints,
          inference.id,
          "inference",
          [...elementPath, ":inferences", inferenceIndex, ":id"],
          errors,
        );
      });
    }
  });
  return endpoints;
}

function missingReference(
  id: string,
  path: Path,
  errors: Diagnostic[],
): void {
  errors.push({
    code: "semantic/missing-reference",
    message: `Unknown local id :${id}`,
    path,
  });
}

function validateInferenceReferences(
  component: CandidateSolverComponent,
  endpoints: ReadonlyMap<string, EndpointKind>,
  path: Path,
  errors: Diagnostic[],
): void {
  component.elements.forEach((element, index) => {
    if (element.kind !== "argument") return;
    element.inferences.forEach((inference, inferenceIndex) => {
      const inferencePath = [
        ...path,
        ":elements",
        index,
        ":inferences",
        inferenceIndex,
      ];
      const refs = [
        ...inference.premises.map((id, premiseIndex) =>
          [id, [...inferencePath, ":premises", premiseIndex]] as const
        ),
        [inference.conclusion, [...inferencePath, ":conclusion"]] as const,
      ];
      refs.forEach(([id, refPath]) => {
        const kind = endpoints.get(id);
        if (kind === undefined) missingReference(id, refPath, errors);
        else if (kind !== "statement") {
          errors.push({
            code: "semantic/invalid-reference-kind",
            message: `Expected :${id} to be a statement`,
            path: refPath,
          });
        }
      });
    });
  });
}

function isEntityLike(kind: EndpointKind | undefined): boolean {
  return kind === "statement" || kind === "argument" ||
    kind === "child-solver";
}

function validateRelationReferences(
  component: CandidateSolverComponent,
  endpoints: ReadonlyMap<string, EndpointKind>,
  path: Path,
  errors: Diagnostic[],
): void {
  component.elements.forEach((element, index) => {
    if (
      element.kind === "statement" ||
      element.kind === "argument" ||
      element.kind === "solver"
    ) {
      return;
    }
    const relationPath = [...path, ":elements", index];
    const fromKind = endpoints.get(element.from);
    const toKind = endpoints.get(element.to);
    if (fromKind === undefined) {
      missingReference(element.from, [...relationPath, ":from"], errors);
    }
    if (toKind === undefined) {
      missingReference(element.to, [...relationPath, ":to"], errors);
    }
    if (fromKind !== undefined && !isEntityLike(fromKind)) {
      errors.push({
        code: "semantic/unsupported-endpoint",
        message:
          `${component.solver} does not support ${fromKind} as relation source`,
        path: [...relationPath, ":from"],
      });
    }
    if (toKind === undefined) return;
    const supportedTarget = element.kind === "undercut"
      ? toKind === "inference" || toKind === "relation"
      : isEntityLike(toKind);
    if (!supportedTarget) {
      errors.push({
        code: "semantic/unsupported-endpoint",
        message:
          `${component.solver} does not support ${toKind} as ${element.kind} target`,
        path: [...relationPath, ":to"],
      });
    }
  });
}

function validateInterface(
  component: CandidateSolverComponent,
  endpoints: ReadonlyMap<string, EndpointKind>,
  path: Path,
  errors: Diagnostic[],
): void {
  if (component.interface === undefined) {
    errors.push({
      code: "semantic/missing-interface",
      message: `Solver :${component.id} requires an interface`,
      path: [...path, ":interface"],
    });
    return;
  }
  const ref = component.interface.aggregate.inputs[0].ref;
  const kind = endpoints.get(ref);
  const refPath = [
    ...path,
    ":interface",
    ":aggregate",
    ":inputs",
    0,
    ":ref",
  ];
  if (kind === undefined) {
    missingReference(ref, refPath, errors);
  } else if (!isEntityLike(kind)) {
    errors.push({
      code: "semantic/non-selectable-endpoint",
      message:
        `Solver ${component.solver} has no native result for ${kind} :${ref}`,
      path: refPath,
    });
  }

  const multi = component.solver === PREFERRED_SOLVER_TAG ||
    component.solver === STABLE_SOLVER_TAG ||
    component.solver === COMPLETE_SOLVER_TAG;
  if (multi && component.interface.observer === undefined) {
    errors.push({
      code: "semantic/missing-observer",
      message: `Solver ${component.solver} requires an extension observer`,
      path: [...path, ":interface", ":observer"],
    });
  } else if (!multi && component.interface.observer !== undefined) {
    errors.push({
      code: "semantic/unsupported-observer",
      message:
        `Solver ${component.solver} does not accept an extension observer`,
      path: [...path, ":interface", ":observer"],
    });
  }
}

function validateImports(
  component: CandidateSolverComponent,
  path: Path,
  errors: Diagnostic[],
): void {
  const children = new Map(
    component.elements
      .filter((element): element is CandidateSolverComponent =>
        element.kind === "solver"
      )
      .map((child) => [child.id, child] as const),
  );
  const compositeMulti = component.solver === PREFERRED_SOLVER_TAG ||
    component.solver === STABLE_SOLVER_TAG ||
    component.solver === COMPLETE_SOLVER_TAG;
  if (
    children.size > 0 &&
    component.solver !== "casualtheorics.argdown2.solver/grounded"
  ) {
    errors.push({
      code: "semantic/unsupported-composite-parent",
      message: `Composite parent ${component.solver} has no import adapter`,
      path,
    });
  }
  for (const [childId, projection] of component.imports) {
    if (!children.has(childId)) {
      errors.push({
        code: "semantic/invalid-import-key",
        message: `Import :${childId} is not an immediate child solver`,
        path: [...path, ":imports", childId],
      });
    }
    if (
      projection.outAtMost < 0 ||
      projection.inAtLeast > 1 ||
      projection.outAtMost >= projection.inAtLeast
    ) {
      errors.push({
        code: "semantic/invalid-projection-bounds",
        message: "Threshold requires 0 <= :out-at-most < :in-at-least <= 1",
        path: [...path, ":imports", childId],
      });
    }
  }
  if (
    !compositeMulti &&
    component.solver === "casualtheorics.argdown2.solver/grounded"
  ) {
    for (const child of children.values()) {
      const multiChild = child.solver === PREFERRED_SOLVER_TAG ||
        child.solver === STABLE_SOLVER_TAG ||
        child.solver === COMPLETE_SOLVER_TAG;
      if (multiChild && !component.imports.some(([id]) => id === child.id)) {
        errors.push({
          code: "semantic/incompatible-boundary-range",
          message:
            `Child :${child.id} may emit fractional confidence; parent import projection required`,
          path: [...path, ":imports", child.id],
        });
      }
    }
  }
}

function toInference(candidate: CandidateInference): Inference {
  return {
    ...candidate,
    id: inferenceId(candidate.id),
    premises: candidate.premises.map(entityId),
    conclusion: entityId(candidate.conclusion),
  };
}

function toStatement(candidate: CandidateStatement): Statement {
  return { ...candidate, id: entityId(candidate.id) };
}

function toArgument(candidate: CandidateArgument): Argument {
  return {
    ...candidate,
    id: entityId(candidate.id),
    inferences: candidate.inferences.map(toInference),
  };
}

function toRelation(candidate: CandidateRelation): Relation {
  return {
    ...candidate,
    id: entityId(candidate.id),
    from: entityId(candidate.from),
    to: entityId(candidate.to),
  };
}

function validateComponent(
  candidate: CandidateSolverComponent,
  path: Path,
  errors: Diagnostic[],
): SolverComponent | undefined {
  const start = errors.length;
  const endpoints = collectEndpoints(candidate, path, errors);
  validateInferenceReferences(candidate, endpoints, path, errors);
  validateRelationReferences(candidate, endpoints, path, errors);
  validateInterface(candidate, endpoints, path, errors);
  validateImports(candidate, path, errors);

  const elements: TheoryElement[] = [];
  candidate.elements.forEach((element, index) => {
    if (element.kind === "solver") {
      const child = validateComponent(
        element,
        [...path, ":elements", index],
        errors,
      );
      if (child !== undefined) elements.push(child);
    } else if (element.kind === "statement") {
      elements.push(toStatement(element));
    } else if (element.kind === "argument") {
      elements.push(toArgument(element));
    } else {
      elements.push(toRelation(element));
    }
  });
  if (errors.length > start || candidate.interface === undefined) {
    return undefined;
  }
  return {
    kind: "solver",
    solver: candidate.solver,
    id: entityId(candidate.id),
    interface: candidate.interface,
    imports: new Map(
      candidate.imports.map(([id, projection]) =>
        [entityId(id), projection] as const
      ),
    ),
    elements,
    extra: candidate.extra,
  };
}

export function validateCandidate(
  candidate: CandidateDocument,
): ValidationResult {
  const errors: Diagnostic[] = [];
  const root = validateComponent(candidate.root, [":root"], errors);
  if (root === undefined || errors.length > 0) return { ok: false, errors };
  const document: Document = {
    id: candidate.id,
    root,
    extra: candidate.extra,
  };
  return { ok: true, document };
}
