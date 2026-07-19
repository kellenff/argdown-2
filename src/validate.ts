import type {
  Argument,
  CandidateArgument,
  CandidateDocument,
  CandidateElement,
  CandidateInference,
  CandidateRelation,
  CandidateStatement,
  Diagnostic,
  EntityId,
  GroundedDocument,
  Inference,
  InferenceId,
  Relation,
  Statement,
  TheoryElement,
  ValidationResult,
} from "./model.js";

type Kind = "argument" | "inference" | "statement";

function entityId(value: string): EntityId {
  return value as EntityId;
}

function inferenceId(value: string): InferenceId {
  return value as InferenceId;
}

function collectKinds(
  elements: readonly CandidateElement[],
  errors: Diagnostic[],
): ReadonlyMap<string, Kind> {
  const kinds = new Map<string, Kind>();
  const add = (id: string, kind: Kind, path: readonly (number | string)[]) => {
    if (kinds.has(id)) {
      errors.push({
        code: "semantic/duplicate-id",
        message: `Duplicate id :${id}`,
        path,
      });
    } else {
      kinds.set(id, kind);
    }
  };
  elements.forEach((element, index) => {
    if (element.kind === "statement" || element.kind === "argument") {
      add(element.id, element.kind, [index, ":id"]);
    }
    if (element.kind === "argument") {
      element.inferences.forEach((inference, inferenceIndex) => {
        add(inference.id, "inference", [
          index,
          ":inferences",
          inferenceIndex,
          ":id",
        ]);
      });
    }
  });
  return kinds;
}

function isEntityKind(
  kind: Kind | undefined,
): kind is "argument" | "statement" {
  return kind === "argument" || kind === "statement";
}

function reportMissingReference(
  id: string,
  path: readonly (number | string)[],
  errors: Diagnostic[],
): void {
  errors.push({
    code: "semantic/missing-reference",
    message: `Unknown id :${id}`,
    path,
  });
}

function validateStatementReference(
  id: string,
  path: readonly (number | string)[],
  kinds: ReadonlyMap<string, Kind>,
  errors: Diagnostic[],
): void {
  const kind = kinds.get(id);
  if (kind === undefined) {
    reportMissingReference(id, path, errors);
  } else if (kind !== "statement") {
    errors.push({
      code: "semantic/invalid-reference-kind",
      message: `Expected :${id} to be a statement`,
      path,
    });
  }
}

function validateInferenceReferences(
  elements: readonly CandidateElement[],
  kinds: ReadonlyMap<string, Kind>,
  errors: Diagnostic[],
): void {
  elements.forEach((element, index) => {
    if (element.kind !== "argument") return;
    element.inferences.forEach((inference, inferenceIndex) => {
      inference.premises.forEach((premise, premiseIndex) => {
        validateStatementReference(
          premise,
          [index, ":inferences", inferenceIndex, ":premises", premiseIndex],
          kinds,
          errors,
        );
      });
      validateStatementReference(
        inference.conclusion,
        [index, ":inferences", inferenceIndex, ":conclusion"],
        kinds,
        errors,
      );
    });
  });
}

function validateEntityEndpoint(
  id: string,
  path: readonly (number | string)[],
  kinds: ReadonlyMap<string, Kind>,
  errors: Diagnostic[],
): void {
  const kind = kinds.get(id);
  if (kind === undefined) {
    reportMissingReference(id, path, errors);
  } else if (!isEntityKind(kind)) {
    errors.push({
      code: "semantic/invalid-endpoint",
      message: `Expected :${id} to be a statement or argument`,
      path,
    });
  }
}

function validateRelationReferences(
  elements: readonly CandidateElement[],
  kinds: ReadonlyMap<string, Kind>,
  errors: Diagnostic[],
): void {
  elements.forEach((element, index) => {
    if (
      element.kind !== "support" &&
      element.kind !== "attack" &&
      element.kind !== "contradiction" &&
      element.kind !== "undercut"
    ) {
      return;
    }

    const fromPath = [index, ":from"] as const;
    const toPath = [index, ":to"] as const;

    if (element.kind === "undercut") {
      validateEntityEndpoint(element.from, fromPath, kinds, errors);
      const toKind = kinds.get(element.to);
      if (toKind === undefined) {
        reportMissingReference(element.to, toPath, errors);
      } else if (toKind !== "inference") {
        errors.push({
          code: "semantic/invalid-endpoint",
          message: `Expected :${element.to} to be an inference`,
          path: toPath,
        });
      }
    } else {
      validateEntityEndpoint(element.from, fromPath, kinds, errors);
      validateEntityEndpoint(element.to, toPath, kinds, errors);
    }
  });
}

function toValidatedInference(inference: CandidateInference): Inference {
  return {
    ...inference,
    id: inferenceId(inference.id),
    premises: inference.premises.map(entityId),
    conclusion: entityId(inference.conclusion),
  };
}

function toValidatedStatement(statement: CandidateStatement): Statement {
  return {
    ...statement,
    id: entityId(statement.id),
  };
}

function toValidatedArgument(argument: CandidateArgument): Argument {
  return {
    ...argument,
    id: entityId(argument.id),
    inferences: argument.inferences.map(toValidatedInference),
  };
}

function toValidatedRelation(relation: CandidateRelation): Relation {
  const base = { extra: relation.extra };
  switch (relation.kind) {
    case "undercut":
      return {
        ...base,
        kind: "undercut",
        from: entityId(relation.from),
        to: inferenceId(relation.to),
      };
    case "support":
    case "attack":
    case "contradiction":
      return {
        ...base,
        kind: relation.kind,
        from: entityId(relation.from),
        to: entityId(relation.to),
      };
  }
}

function toValidatedElement(element: CandidateElement): TheoryElement {
  switch (element.kind) {
    case "statement":
      return toValidatedStatement(element);
    case "argument":
      return toValidatedArgument(element);
    case "support":
    case "attack":
    case "contradiction":
    case "undercut":
      return toValidatedRelation(element);
  }
}

export function validateCandidate(
  candidate: CandidateDocument,
): ValidationResult {
  const errors: Diagnostic[] = [];
  const kinds = collectKinds(candidate.elements, errors);
  validateInferenceReferences(candidate.elements, kinds, errors);
  validateRelationReferences(candidate.elements, kinds, errors);
  if (errors.length > 0) return { ok: false, errors };

  const elements = candidate.elements.map(toValidatedElement);
  const document: GroundedDocument = {
    elements,
    solver: candidate.solver,
  };
  return { ok: true, document };
}
