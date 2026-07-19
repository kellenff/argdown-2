import type { EDN } from "edn-parser-js";
import { z } from "zod";

import {
  type CandidateArgument,
  type CandidateDocument,
  type CandidateElement,
  type CandidateInference,
  type CandidateRelation,
  type CandidateStatement,
  type Diagnostic,
  type ExtraEntry,
  isSolverTag,
  type RelationKind,
  type SolverTag,
} from "./model.js";

const ROOT_NAMESPACE = "casualtheorics.argdown2.solver";
const THEORY_NAMESPACE = "casualtheorics.argdown2.argdown";

const symbolSchema = z.strictObject({
  ns: z.string().optional(),
  symbol: z.string(),
});
const keywordSchema = z.strictObject({
  keyword: z.string(),
  ns: z.string().optional(),
});
const charSchema = z.strictObject({ char: z.string() });
// deno-lint-ignore prefer-const -- assigned after recursive lazy schemas are defined
let ednValueSchema: z.ZodType<unknown>;
const nestedEdnSchema = z.lazy(() => ednValueSchema);
const mapSchema = z.strictObject({
  map: z.array(z.tuple([nestedEdnSchema, nestedEdnSchema])),
});
const setSchema = z.strictObject({ set: z.array(nestedEdnSchema) });
const listSchema = z.strictObject({ list: z.array(nestedEdnSchema) });
const taggedSchema = z.strictObject({
  tag: symbolSchema,
  value: nestedEdnSchema,
});
const metadataSchema = z.strictObject({
  meta: z.array(z.tuple([nestedEdnSchema, nestedEdnSchema])),
  value: nestedEdnSchema,
});
ednValueSchema = z.union([
  z.number(),
  z.null(),
  z.boolean(),
  z.string(),
  symbolSchema,
  keywordSchema,
  charSchema,
  z.array(nestedEdnSchema),
  mapSchema,
  setSchema,
  listSchema,
  taggedSchema,
  metadataSchema,
]);

type DecodeResult =
  | { ok: true; document: CandidateDocument }
  | { ok: false; errors: readonly Diagnostic[] };
type Fields = {
  known: ReadonlyMap<string, unknown>;
  extra: readonly ExtraEntry[];
};
type Path = readonly (number | string)[];

const statementKeys = new Set(["id", "text", "tags", "metadata"]);
const argumentKeys = new Set([
  "id",
  "description",
  "tags",
  "metadata",
  "inferences",
]);
const inferenceKeys = new Set([
  "id",
  "premises",
  "conclusion",
  "rules",
  "metadata",
]);
const relationKeys = new Set(["from", "to"]);

const defaultTags: readonly string[] = [];
const defaultRules: readonly string[] = [];
const defaultInferences: readonly CandidateInference[] = [];

function fullName(value: { ns?: string | undefined; symbol: string }): string {
  return value.ns === undefined ? value.symbol : `${value.ns}/${value.symbol}`;
}

function keywordName(value: unknown): string | undefined {
  const parsed = keywordSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const { keyword, ns } = parsed.data;
  return ns === undefined ? keyword : `${ns}/${keyword}`;
}

function fieldsOf(
  value: unknown,
  recognized: ReadonlySet<string>,
): Fields | undefined {
  const parsed = mapSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const known = new Map<string, unknown>();
  const extra: ExtraEntry[] = [];
  for (const [key, entryValue] of parsed.data.map) {
    const name = keywordName(key);
    if (name !== undefined && recognized.has(name)) known.set(name, entryValue);
    else extra.push([key, entryValue] as const);
  }
  return { known, extra };
}

function canonicalEdn(value: EDN): string {
  if (value === null) return "nil";
  if (typeof value === "string") return `string:${JSON.stringify(value)}`;
  if (typeof value === "number") return `number:${value}`;
  if (typeof value === "boolean") return `boolean:${value}`;
  if (Array.isArray(value)) {
    return `vector:[${value.map(canonicalEdn).join(",")}]`;
  }
  if ("keyword" in value) return `keyword:${value.ns ?? ""}/${value.keyword}`;
  if ("symbol" in value) return `symbol:${value.ns ?? ""}/${value.symbol}`;
  if ("char" in value) return `char:${JSON.stringify(value.char)}`;
  if ("map" in value) {
    return `map:{${
      value.map
        .map(([k, v]) => `${canonicalEdn(k)}=>${canonicalEdn(v)}`)
        .sort()
        .join(",")
    }}`;
  }
  if ("set" in value) {
    return `set:{${value.set.map(canonicalEdn).sort().join(",")}}`;
  }
  if ("list" in value) {
    return `list:(${value.list.map(canonicalEdn).join(",")})`;
  }
  if ("tag" in value) {
    return `tag:${canonicalEdn(value.tag)}:${canonicalEdn(value.value)}`;
  }
  return `meta:{${
    value.meta
      .map(([k, v]) => `${canonicalEdn(k)}=>${canonicalEdn(v)}`)
      .sort()
      .join(",")
  }}:${canonicalEdn(value.value)}`;
}

function validateCollectionUniqueness(
  value: EDN,
  path: Path = [],
): Diagnostic[] {
  const errors: Diagnostic[] = [];
  const visit = (entry: EDN, nextPath: Path) =>
    errors.push(...validateCollectionUniqueness(entry, nextPath));
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, [...path, index]));
    return errors;
  }
  if (value === null || typeof value !== "object") return errors;
  if ("map" in value) {
    const seen = new Set<string>();
    value.map.forEach(([key, entryValue], index) => {
      const canonicalKey = canonicalEdn(key);
      if (seen.has(canonicalKey)) {
        errors.push({
          code: "schema/duplicate-map-key",
          message: "Duplicate EDN map key",
          path: [...path, index],
        });
      }
      seen.add(canonicalKey);
      visit(key, [...path, index, "key"]);
      visit(entryValue, [...path, index, "value"]);
    });
    return errors;
  }
  if ("set" in value) {
    const seen = new Set<string>();
    value.set.forEach((entry, index) => {
      const canonicalEntry = canonicalEdn(entry);
      if (seen.has(canonicalEntry)) {
        errors.push({
          code: "schema/duplicate-set-value",
          message: "Duplicate EDN set value",
          path: [...path, index],
        });
      }
      seen.add(canonicalEntry);
      visit(entry, [...path, index]);
    });
    return errors;
  }
  if ("list" in value) {
    value.list.forEach((entry, index) => visit(entry, [...path, index]));
    return errors;
  }
  if ("tag" in value) {
    visit(value.value, [...path, "value"]);
    return errors;
  }
  if ("meta" in value) {
    visit({ map: value.meta }, [...path, "meta"]);
    visit(value.value, [...path, "value"]);
  }
  return errors;
}

const fieldPath = (path: Path, name: string) => [...path, `:${name}`];
const pushMissing = (errors: Diagnostic[], path: Path, name: string) =>
  errors.push({
    code: "schema/missing-required",
    message: `Missing required :${name}`,
    path: fieldPath(path, name),
  });
const pushInvalid = (
  errors: Diagnostic[],
  path: Path,
  name: string,
  message: string,
) =>
  errors.push({
    code: "schema/invalid-field",
    message,
    path: fieldPath(path, name),
  });

function requiredKeyword(
  fields: Fields,
  name: string,
  path: Path,
  errors: Diagnostic[],
): string | undefined {
  if (!fields.known.has(name)) {
    pushMissing(errors, path, name);
    return undefined;
  }
  const value = keywordName(fields.known.get(name));
  if (value === undefined) {
    pushInvalid(errors, path, name, `Expected keyword :${name}`);
  }
  return value;
}

function keywordVector(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const names = value.map(keywordName);
  return names.every((name) => name !== undefined)
    ? (names as string[])
    : undefined;
}

function keywordSet(value: unknown): readonly string[] | undefined {
  const parsed = setSchema.safeParse(value);
  return parsed.success ? keywordVector(parsed.data.set) : undefined;
}

function expectMap(
  value: unknown,
  recognized: ReadonlySet<string>,
  path: Path,
  errors: Diagnostic[],
): Fields | undefined {
  const fields = fieldsOf(value, recognized);
  if (fields !== undefined) return fields;
  errors.push({
    code: "schema/expected-map",
    message: "Expected tagged EDN map",
    path,
  });
  return undefined;
}

function optionalParsed<T>(
  fields: Fields,
  name: string,
  path: Path,
  errors: Diagnostic[],
  parse: (value: unknown) => T | undefined,
  expected: string,
): T | undefined {
  if (!fields.known.has(name)) return undefined;
  const parsed = parse(fields.known.get(name));
  if (parsed === undefined) {
    pushInvalid(errors, path, name, `${expected} :${name}`);
  }
  return parsed;
}

function pushUnsupportedTag(
  errors: Diagnostic[],
  path: Path,
  name: string,
): void {
  errors.push({
    code: "edn/unsupported-tag",
    message: `Unsupported tag #${name}`,
    path,
  });
}

function decodeInference(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
): CandidateInference | undefined {
  const start = errors.length;
  const fields = expectMap(value, inferenceKeys, path, errors);
  if (fields === undefined) return undefined;
  const id = requiredKeyword(fields, "id", path, errors);
  let premises: readonly string[] | undefined;
  if (!fields.known.has("premises")) pushMissing(errors, path, "premises");
  else {
    premises = keywordVector(fields.known.get("premises"));
    if (premises === undefined || premises.length === 0) {
      pushInvalid(
        errors,
        path,
        "premises",
        "Expected non-empty keyword vector :premises",
      );
    }
  }
  const conclusion = requiredKeyword(fields, "conclusion", path, errors);
  const rules = optionalParsed(
    fields,
    "rules",
    path,
    errors,
    keywordVector,
    "Expected keyword vector",
  ) ??
    defaultRules;
  const metadata = fields.known.get("metadata");
  if (
    errors.length > start ||
    id === undefined ||
    premises === undefined ||
    conclusion === undefined
  ) {
    return undefined;
  }
  return {
    kind: "inference",
    id,
    premises,
    conclusion,
    rules,
    extra: fields.extra,
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function decodeInferenceEntry(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
): CandidateInference | undefined {
  const tagged = taggedSchema.safeParse(value);
  if (!tagged.success) {
    errors.push({
      code: "schema/invalid-field",
      message: "Expected tagged inference entry",
      path,
    });
    return undefined;
  }
  const name = fullName(tagged.data.tag);
  if (
    tagged.data.tag.ns !== THEORY_NAMESPACE ||
    tagged.data.tag.symbol !== "inference"
  ) {
    pushUnsupportedTag(errors, path, name);
    return undefined;
  }
  return decodeInference(tagged.data.value, path, errors);
}

function decodeStatement(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
): CandidateStatement | undefined {
  const start = errors.length;
  const fields = expectMap(value, statementKeys, path, errors);
  if (fields === undefined) return undefined;
  const id = requiredKeyword(fields, "id", path, errors);
  const text = optionalParsed(
    fields,
    "text",
    path,
    errors,
    (value) => (typeof value === "string" ? value : undefined),
    "Expected string",
  );
  const tags = optionalParsed(
    fields,
    "tags",
    path,
    errors,
    keywordSet,
    "Expected keyword set",
  ) ?? defaultTags;
  const metadata = fields.known.get("metadata");
  if (errors.length > start || id === undefined) return undefined;
  return {
    kind: "statement",
    id,
    tags,
    extra: fields.extra,
    ...(text === undefined ? {} : { text }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function decodeArgument(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
): CandidateArgument | undefined {
  const start = errors.length;
  const fields = expectMap(value, argumentKeys, path, errors);
  if (fields === undefined) return undefined;
  const id = requiredKeyword(fields, "id", path, errors);
  const description = optionalParsed(
    fields,
    "description",
    path,
    errors,
    (value) => (typeof value === "string" ? value : undefined),
    "Expected string",
  );
  const tags = optionalParsed(
    fields,
    "tags",
    path,
    errors,
    keywordSet,
    "Expected keyword set",
  ) ?? defaultTags;
  let inferences: readonly CandidateInference[] = defaultInferences;
  if (fields.known.has("inferences")) {
    const raw = fields.known.get("inferences");
    if (!Array.isArray(raw)) {
      pushInvalid(
        errors,
        path,
        "inferences",
        "Expected tagged inference vector :inferences",
      );
    } else {
      const decoded: CandidateInference[] = [];
      raw.forEach((entry, index) => {
        const inference = decodeInferenceEntry(entry, [
          ...path,
          ":inferences",
          index,
        ], errors);
        if (inference !== undefined) decoded.push(inference);
      });
      inferences = decoded;
    }
  }
  const metadata = fields.known.get("metadata");
  if (errors.length > start || id === undefined) return undefined;
  return {
    kind: "argument",
    id,
    tags,
    inferences,
    extra: fields.extra,
    ...(description === undefined ? {} : { description }),
    ...(metadata === undefined ? {} : { metadata }),
  };
}

function decodeRelation(
  value: unknown,
  kind: RelationKind,
  path: Path,
  errors: Diagnostic[],
): CandidateRelation | undefined {
  const fields = expectMap(value, relationKeys, path, errors);
  if (fields === undefined) return undefined;
  const from = requiredKeyword(fields, "from", path, errors);
  const to = requiredKeyword(fields, "to", path, errors);
  if (from === undefined || to === undefined) return undefined;
  return { kind, from, to, extra: fields.extra };
}

type DecodeElementOptions = {
  expectedSolver: SolverTag;
  allowNesting: boolean;
};

function decodeSolverVector(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
  options: DecodeElementOptions,
): CandidateDocument | undefined {
  if (!Array.isArray(value)) {
    errors.push({
      code: "schema/root-not-vector",
      message: "Solver root value must be vector",
      path,
    });
    return undefined;
  }
  const elements: CandidateElement[] = [];
  let failed = false;
  value.forEach((entry, index) => {
    const decoded = decodeElement(entry, [...path, index], errors, options);
    if (decoded === undefined) {
      failed = true;
      return;
    }
    elements.push(decoded);
  });
  if (failed) return undefined;
  return { solver: options.expectedSolver, elements };
}

function decodeElement(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
  options: DecodeElementOptions,
): CandidateElement | undefined {
  const tagged = taggedSchema.safeParse(value);
  if (!tagged.success) {
    errors.push({
      code: "schema/invalid-field",
      message: "Expected tagged theory entry",
      path,
    });
    return undefined;
  }
  const name = fullName(tagged.data.tag);

  if (tagged.data.tag.ns === ROOT_NAMESPACE && isSolverTag(name)) {
    if (!options.allowNesting) {
      errors.push({
        code: "schema/nested-solver-depth",
        message: "Nested solvers cannot contain further nested solvers",
        path,
      });
      return undefined;
    }
    if (name !== options.expectedSolver) {
      errors.push({
        code: "schema/nested-solver-mismatch",
        message:
          `Nested solver #${name} must match parent #${options.expectedSolver}`,
        path,
      });
      return undefined;
    }
    const nested = decodeSolverVector(tagged.data.value, path, errors, {
      allowNesting: false,
      expectedSolver: name,
    });
    if (nested === undefined) return undefined;
    return { kind: "nested-solver", document: nested };
  }

  if (tagged.data.tag.ns !== THEORY_NAMESPACE) {
    pushUnsupportedTag(errors, path, name);
    return undefined;
  }
  switch (tagged.data.tag.symbol) {
    case "statement":
      return decodeStatement(tagged.data.value, path, errors);
    case "argument":
      return decodeArgument(tagged.data.value, path, errors);
    case "support":
    case "attack":
    case "contradiction":
    case "undercut":
      return decodeRelation(
        tagged.data.value,
        tagged.data.tag.symbol,
        path,
        errors,
      );
    case "inference":
    default:
      pushUnsupportedTag(errors, path, name);
      return undefined;
  }
}

export function decodeWire(value: unknown): DecodeResult {
  const wire = ednValueSchema.safeParse(value);
  if (!wire.success) {
    return {
      ok: false,
      errors: [{
        code: "schema/invalid-edn-value",
        message: "Invalid EDN value",
      }],
    };
  }
  const validatedWireValue = wire.data as EDN;
  const duplicateErrors = validateCollectionUniqueness(validatedWireValue);
  if (duplicateErrors.length > 0) return { ok: false, errors: duplicateErrors };

  const root = taggedSchema.safeParse(validatedWireValue);
  if (!root.success) {
    return {
      ok: false,
      errors: [{
        code: "schema/missing-root-tag",
        message: "Expected tagged solver root",
      }],
    };
  }
  const rootName = fullName(root.data.tag);
  if (root.data.tag.ns !== ROOT_NAMESPACE || !isSolverTag(rootName)) {
    return {
      ok: false,
      errors: [{
        code: "edn/unsupported-tag",
        message: `Unsupported tag #${rootName}`,
      }],
    };
  }
  const errors: Diagnostic[] = [];
  const document = decodeSolverVector(root.data.value, [], errors, {
    allowNesting: true,
    expectedSolver: rootName,
  });
  if (document === undefined || errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, document };
}
