import { Array as Arr, Effect } from "effect";

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
  ValidateError,
} from "./model.js";
import {
  COMPLETE_SOLVER_TAG,
  PREFERRED_SOLVER_TAG,
  STABLE_SOLVER_TAG,
  supportedRelationKinds,
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

function missingReference(id: string, path: Path): Diagnostic {
  return {
    code: "semantic/missing-reference",
    message: `Unknown local id :${id}`,
    path,
  };
}

function collectEndpoints(
  component: CandidateSolverComponent,
  path: Path,
): Effect.Effect<
  {
    endpoints: ReadonlyMap<string, EndpointKind>;
    diagnostics: readonly Diagnostic[];
  },
  never,
  never
> {
  return Effect.sync(() => {
    const endpoints = new Map<string, EndpointKind>();
    const diagnostics: Diagnostic[] = [];
    const add = (
      id: string,
      kind: EndpointKind,
      idPath: Path,
    ): void => {
      if (endpoints.has(id)) {
        diagnostics.push({
          code: "semantic/duplicate-id",
          message: `Duplicate id :${id}`,
          path: idPath,
        });
        return;
      }
      endpoints.set(id, kind);
    };
    component.elements.forEach((element, index) => {
      const elementPath = [...path, ":elements", index];
      if (element.kind === "solver") {
        add(element.id, "child-solver", [...elementPath, ":id"]);
        return;
      }
      add(
        element.id,
        element.kind === "statement" || element.kind === "argument"
          ? element.kind
          : "relation",
        [...elementPath, ":id"],
      );
      if (element.kind === "argument") {
        element.inferences.forEach((inference, inferenceIndex) => {
          add(
            inference.id,
            "inference",
            [...elementPath, ":inferences", inferenceIndex, ":id"],
          );
        });
      }
    });
    return { endpoints, diagnostics };
  });
}

function validateInferenceReferences(
  component: CandidateSolverComponent,
  endpoints: ReadonlyMap<string, EndpointKind>,
  path: Path,
): Effect.Effect<readonly Diagnostic[], never, never> {
  return Effect.sync(() => {
    const diagnostics: Diagnostic[] = [];
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
          if (kind === undefined) {
            diagnostics.push(missingReference(id, refPath));
          } else if (kind !== "statement") {
            diagnostics.push({
              code: "semantic/invalid-reference-kind",
              message: `Expected :${id} to be a statement`,
              path: refPath,
            });
          }
        });
      });
    });
    return diagnostics;
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
): Effect.Effect<readonly Diagnostic[], never, never> {
  return Effect.sync(() => {
    const diagnostics: Diagnostic[] = [];
    const supportedKinds = supportedRelationKinds(component.solver);
    component.elements.forEach((element, index) => {
      if (
        element.kind === "statement" ||
        element.kind === "argument" ||
        element.kind === "solver"
      ) {
        return;
      }
      const relationPath = [...path, ":elements", index];
      if (!supportedKinds.has(element.kind)) {
        diagnostics.push({
          code: "semantic/unsupported-relation-kind",
          message:
            `${component.solver} does not consume ${element.kind} relations`,
          path: relationPath,
        });
        return;
      }
      const fromKind = endpoints.get(element.from);
      const toKind = endpoints.get(element.to);
      if (fromKind === undefined) {
        diagnostics.push(
          missingReference(element.from, [...relationPath, ":from"]),
        );
      }
      if (toKind === undefined) {
        diagnostics.push(
          missingReference(element.to, [...relationPath, ":to"]),
        );
      }
      if (fromKind !== undefined && !isEntityLike(fromKind)) {
        diagnostics.push({
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
        diagnostics.push({
          code: "semantic/unsupported-endpoint",
          message:
            `${component.solver} does not support ${toKind} as ${element.kind} target`,
          path: [...relationPath, ":to"],
        });
      }
    });
    return diagnostics;
  });
}

function validateInterface(
  component: CandidateSolverComponent,
  endpoints: ReadonlyMap<string, EndpointKind>,
  path: Path,
): Effect.Effect<readonly Diagnostic[], never, never> {
  return Effect.sync(() => {
    const diagnostics: Diagnostic[] = [];
    if (component.interface === undefined) {
      diagnostics.push({
        code: "semantic/missing-interface",
        message: `Solver :${component.id} requires an interface`,
        path: [...path, ":interface"],
      });
      return diagnostics;
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
      diagnostics.push(missingReference(ref, refPath));
    } else if (!isEntityLike(kind)) {
      diagnostics.push({
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
      diagnostics.push({
        code: "semantic/missing-observer",
        message: `Solver ${component.solver} requires an extension observer`,
        path: [...path, ":interface", ":observer"],
      });
    } else if (!multi && component.interface.observer !== undefined) {
      diagnostics.push({
        code: "semantic/unsupported-observer",
        message:
          `Solver ${component.solver} does not accept an extension observer`,
        path: [...path, ":interface", ":observer"],
      });
    }
    return diagnostics;
  });
}

function validateImports(
  component: CandidateSolverComponent,
  path: Path,
): Effect.Effect<readonly Diagnostic[], never, never> {
  return Effect.sync(() => {
    const diagnostics: Diagnostic[] = [];
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
      diagnostics.push({
        code: "semantic/unsupported-composite-parent",
        message: `Composite parent ${component.solver} has no import adapter`,
        path,
      });
    }
    for (const [childId, projection] of component.imports) {
      if (!children.has(childId)) {
        diagnostics.push({
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
        diagnostics.push({
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
          diagnostics.push({
            code: "semantic/incompatible-boundary-range",
            message:
              `Child :${child.id} may emit fractional confidence; parent import projection required`,
            path: [...path, ":imports", child.id],
          });
        }
      }
    }
    return diagnostics;
  });
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
): Effect.Effect<SolverComponent, Arr.NonEmptyArray<Diagnostic>, never> {
  return Effect.gen(function* () {
    const { endpoints, diagnostics: d0 } = yield* collectEndpoints(
      candidate,
      path,
    );
    const d1 = yield* validateInferenceReferences(candidate, endpoints, path);
    const d2 = yield* validateRelationReferences(candidate, endpoints, path);
    const d3 = yield* validateInterface(candidate, endpoints, path);
    const d4 = yield* validateImports(candidate, path);

    const elements: TheoryElement[] = [];
    const childDiagnostics: Diagnostic[] = [];
    for (let index = 0; index < candidate.elements.length; index++) {
      const element = candidate.elements[index]!;
      if (element.kind === "solver") {
        const child = yield* Effect.match(
          validateComponent(element, [...path, ":elements", index]),
          {
            onFailure: (diags) => {
              childDiagnostics.push(...diags);
              return null;
            },
            onSuccess: (c) => c,
          },
        );
        if (child !== null) elements.push(child);
      } else if (element.kind === "statement") {
        elements.push(toStatement(element));
      } else if (element.kind === "argument") {
        elements.push(toArgument(element));
      } else {
        elements.push(toRelation(element));
      }
    }

    const diagnostics = [
      ...d0,
      ...d1,
      ...d2,
      ...d3,
      ...d4,
      ...childDiagnostics,
    ];
    if (diagnostics.length > 0 || candidate.interface === undefined) {
      if (diagnostics.length === 0) {
        // Defensive: interface missing should already be in d3 from validateInterface.
        return yield* Effect.fail([
          {
            code: "semantic/missing-interface",
            message: `Solver :${candidate.id} requires an interface`,
            path: [...path, ":interface"],
          },
        ] as Arr.NonEmptyArray<Diagnostic>);
      }
      return yield* Effect.fail(
        diagnostics as Arr.NonEmptyArray<Diagnostic>,
      );
    }
    return {
      kind: "solver" as const,
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
  });
}

export function validateCandidate(
  candidate: CandidateDocument,
): Effect.Effect<Document, ValidateError, never> {
  return validateComponent(candidate.root, [":root"]).pipe(
    Effect.map((root) => ({
      id: candidate.id,
      root,
      extra: candidate.extra,
    })),
    Effect.mapError((diagnostics) => ({
      _tag: "Semantic" as const,
      diagnostics,
    })),
  );
}
