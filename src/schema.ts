import type { EDN } from "edn-parser-js";
import { z } from "zod";

import {
  AGGREGATE_IDENTITY_TAG,
  type AggregateInput,
  type CandidateArgument,
  type CandidateDocument,
  type CandidateElement,
  type CandidateInference,
  type CandidateRelation,
  type CandidateSolverComponent,
  type CandidateStatement,
  type Diagnostic,
  DOCUMENT_TAG,
  EXTENSION_PROPORTION_OBSERVER_TAG,
  type ExtraEntry,
  isSolverTag,
  PROJECTION_THRESHOLD_TAG,
  type RelationKind,
  type SolverInterface,
  type ThresholdProjection,
} from "./model.js";

const DOCUMENT_NAMESPACE = "casualtheorics.argdown2";
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
const relationKeys = new Set(["id", "from", "to"]);
const documentKeys = new Set(["id", "root"]);
const solverKeys = new Set(["id", "interface", "imports", "elements"]);
const interfaceKeys = new Set(["aggregate", "observer"]);
const observerKeys = new Set(["mode"]);
const aggregateKeys = new Set(["inputs"]);
const inputKeys = new Set(["ref"]);
const projectionKeys = new Set(["out-at-most", "in-at-least", "otherwise"]);

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

function requiredNumber(
  fields: Fields,
  name: string,
  path: Path,
  errors: Diagnostic[],
): number | undefined {
  if (!fields.known.has(name)) {
    pushMissing(errors, path, name);
    return undefined;
  }
  const value = fields.known.get(name);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    pushInvalid(errors, path, name, `Expected finite number :${name}`);
    return undefined;
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
  const start = errors.length;
  const fields = expectMap(value, relationKeys, path, errors);
  if (fields === undefined) return undefined;
  const id = requiredKeyword(fields, "id", path, errors);
  const from = requiredKeyword(fields, "from", path, errors);
  const to = requiredKeyword(fields, "to", path, errors);
  if (
    errors.length > start ||
    id === undefined ||
    from === undefined ||
    to === undefined
  ) {
    return undefined;
  }
  return { kind, id, from, to, extra: fields.extra };
}

function decodeAggregateInput(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
): AggregateInput | undefined {
  const fields = expectMap(value, inputKeys, path, errors);
  if (fields === undefined) return undefined;
  const ref = requiredKeyword(fields, "ref", path, errors);
  return ref === undefined ? undefined : { ref };
}

function decodeInterface(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
): SolverInterface | undefined {
  const fields = expectMap(value, interfaceKeys, path, errors);
  if (fields === undefined) return undefined;
  if (!fields.known.has("aggregate")) {
    pushMissing(errors, path, "aggregate");
    return undefined;
  }
  const aggregate = taggedSchema.safeParse(fields.known.get("aggregate"));
  if (
    !aggregate.success ||
    fullName(aggregate.data.tag) !== AGGREGATE_IDENTITY_TAG
  ) {
    pushInvalid(
      errors,
      path,
      "aggregate",
      `Expected #${AGGREGATE_IDENTITY_TAG}`,
    );
    return undefined;
  }
  const aggregateFields = expectMap(
    aggregate.data.value,
    aggregateKeys,
    [...path, ":aggregate"],
    errors,
  );
  if (aggregateFields === undefined) return undefined;
  const rawInputs = aggregateFields.known.get("inputs");
  if (!Array.isArray(rawInputs)) {
    if (!aggregateFields.known.has("inputs")) {
      pushMissing(errors, [...path, ":aggregate"], "inputs");
    } else {
      pushInvalid(
        errors,
        [...path, ":aggregate"],
        "inputs",
        "Expected vector :inputs",
      );
    }
    return undefined;
  }
  if (rawInputs.length !== 1) {
    pushInvalid(
      errors,
      [...path, ":aggregate"],
      "inputs",
      "Identity aggregate requires exactly one input",
    );
    return undefined;
  }
  const input = decodeAggregateInput(
    rawInputs[0],
    [...path, ":aggregate", ":inputs", 0],
    errors,
  );
  if (input === undefined) return undefined;

  let observer: SolverInterface["observer"];
  if (fields.known.has("observer")) {
    const tagged = taggedSchema.safeParse(fields.known.get("observer"));
    const observerFields = tagged.success
      ? fieldsOf(tagged.data.value, observerKeys)
      : undefined;
    if (
      !tagged.success ||
      fullName(tagged.data.tag) !== EXTENSION_PROPORTION_OBSERVER_TAG ||
      observerFields === undefined ||
      keywordName(observerFields.known.get("mode")) !== "proportion"
    ) {
      pushInvalid(
        errors,
        path,
        "observer",
        `Expected #${EXTENSION_PROPORTION_OBSERVER_TAG} {:mode :proportion}`,
      );
      return undefined;
    }
    observer = { tag: EXTENSION_PROPORTION_OBSERVER_TAG };
  }
  return {
    aggregate: {
      tag: AGGREGATE_IDENTITY_TAG,
      inputs: [input],
    },
    ...(observer === undefined ? {} : { observer }),
  };
}

function decodeThresholdProjection(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
): ThresholdProjection | undefined {
  const tagged = taggedSchema.safeParse(value);
  if (
    !tagged.success ||
    fullName(tagged.data.tag) !== PROJECTION_THRESHOLD_TAG
  ) {
    errors.push({
      code: "schema/invalid-field",
      message: `Expected #${PROJECTION_THRESHOLD_TAG}`,
      path,
    });
    return undefined;
  }
  const fields = expectMap(tagged.data.value, projectionKeys, path, errors);
  if (fields === undefined) return undefined;
  const outAtMost = requiredNumber(fields, "out-at-most", path, errors);
  const inAtLeast = requiredNumber(fields, "in-at-least", path, errors);
  if (!fields.known.has("otherwise")) {
    pushMissing(errors, path, "otherwise");
  } else if (fields.known.get("otherwise") !== null) {
    pushInvalid(errors, path, "otherwise", "Expected nil :otherwise");
  }
  if (outAtMost === undefined || inAtLeast === undefined) return undefined;
  return {
    tag: PROJECTION_THRESHOLD_TAG,
    outAtMost,
    inAtLeast,
    otherwise: null,
  };
}

function decodeImports(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
): readonly (readonly [string, ThresholdProjection])[] | undefined {
  const parsed = mapSchema.safeParse(value);
  if (!parsed.success) {
    errors.push({
      code: "schema/invalid-field",
      message: "Expected map :imports",
      path,
    });
    return undefined;
  }
  const imports: Array<readonly [string, ThresholdProjection]> = [];
  parsed.data.map.forEach(([key, entry], index) => {
    const id = keywordName(key);
    if (id === undefined) {
      errors.push({
        code: "schema/invalid-field",
        message: "Expected keyword import key",
        path: [...path, index, "key"],
      });
      return;
    }
    const projection = decodeThresholdProjection(
      entry,
      [...path, id],
      errors,
    );
    if (projection !== undefined) imports.push([id, projection]);
  });
  return imports;
}

function decodeSolverComponent(
  taggedValue: z.infer<typeof taggedSchema>,
  path: Path,
  errors: Diagnostic[],
): CandidateSolverComponent | undefined {
  const solverName = fullName(taggedValue.tag);
  if (taggedValue.tag.ns !== ROOT_NAMESPACE || !isSolverTag(solverName)) {
    pushUnsupportedTag(errors, path, solverName);
    return undefined;
  }
  const start = errors.length;
  const fields = expectMap(taggedValue.value, solverKeys, path, errors);
  if (fields === undefined) return undefined;
  const id = requiredKeyword(fields, "id", path, errors);
  let interfaceValue: SolverInterface | undefined;
  if (fields.known.has("interface")) {
    interfaceValue = decodeInterface(
      fields.known.get("interface"),
      [...path, ":interface"],
      errors,
    );
  }
  let imports: readonly (readonly [string, ThresholdProjection])[] = [];
  if (fields.known.has("imports")) {
    imports = decodeImports(
      fields.known.get("imports"),
      [...path, ":imports"],
      errors,
    ) ?? [];
  }
  const rawElements = fields.known.get("elements");
  const elements: CandidateElement[] = [];
  if (!Array.isArray(rawElements)) {
    if (!fields.known.has("elements")) pushMissing(errors, path, "elements");
    else {
      pushInvalid(errors, path, "elements", "Expected vector :elements");
    }
  } else {
    rawElements.forEach((entry, index) => {
      const decoded = decodeElement(
        entry,
        [...path, ":elements", index],
        errors,
      );
      if (decoded !== undefined) elements.push(decoded);
    });
  }
  if (errors.length > start || id === undefined) return undefined;
  return {
    kind: "solver",
    solver: solverName,
    id,
    imports,
    elements,
    extra: fields.extra,
    ...(interfaceValue === undefined ? {} : { interface: interfaceValue }),
  };
}

function decodeElement(
  value: unknown,
  path: Path,
  errors: Diagnostic[],
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
    return decodeSolverComponent(tagged.data, path, errors);
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
        code: "schema/missing-document-tag",
        message: `Expected #${DOCUMENT_TAG}`,
      }],
    };
  }
  const rootName = fullName(root.data.tag);
  if (
    root.data.tag.ns !== DOCUMENT_NAMESPACE ||
    root.data.tag.symbol !== "document"
  ) {
    return {
      ok: false,
      errors: [{
        code: "schema/missing-document-tag",
        message: `Expected #${DOCUMENT_TAG}; received #${rootName}`,
      }],
    };
  }
  const errors: Diagnostic[] = [];
  const fields = expectMap(root.data.value, documentKeys, [], errors);
  if (fields === undefined) return { ok: false, errors };
  const id = requiredKeyword(fields, "id", [], errors);
  let component: CandidateSolverComponent | undefined;
  if (!fields.known.has("root")) {
    pushMissing(errors, [], "root");
  } else {
    const tagged = taggedSchema.safeParse(fields.known.get("root"));
    if (!tagged.success) {
      pushInvalid(errors, [], "root", "Expected tagged solver component");
    } else {
      component = decodeSolverComponent(tagged.data, [":root"], errors);
    }
  }
  if (id === undefined || component === undefined || errors.length > 0) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    document: { id, root: component, extra: fields.extra },
  };
}
