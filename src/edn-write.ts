import type {
  CandidateArgument,
  CandidateDocument,
  CandidateElement,
  CandidateInference,
  CandidateRelation,
  CandidateStatement,
  ExtraEntry,
} from "./model.js";

const ROOT_NS = "casualtheorics.argdown2.solver";
const THEORY_NS = "casualtheorics.argdown2.argdown";

function printTag(ns: string, symbol: string): string {
  return `#${ns}/${symbol}`;
}

function printKeyword(id: string): string {
  return `:${id}`;
}

function printString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  if (
    "map" in obj || "set" in obj || "list" in obj || "keyword" in obj ||
    "tag" in obj
  ) {
    return false;
  }
  return Object.values(obj).every((entry) => typeof entry === "string");
}

export function printWire(value: unknown): string {
  if (value === null) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return printString(value);
  if (Array.isArray(value)) {
    const items = value.map(printWire);
    return `[${items.join(" ")}]`;
  }
  if (typeof value !== "object") {
    throw new Error(`Cannot print wire value: ${String(value)}`);
  }

  const obj = value as Record<string, unknown>;
  if ("keyword" in obj && typeof obj.keyword === "string") {
    const ns = obj.ns as string | undefined;
    return ns === undefined ? `:${obj.keyword}` : `:${ns}/${obj.keyword}`;
  }
  if ("symbol" in obj && typeof obj.symbol === "string") {
    const ns = obj.ns as string | undefined;
    return ns === undefined ? obj.symbol : `${ns}/${obj.symbol}`;
  }
  if ("char" in obj && typeof obj.char === "string") {
    return `\\${obj.char}`;
  }
  if ("map" in obj && Array.isArray(obj.map)) {
    const pairs = (obj.map as Array<[unknown, unknown]>).map(
      ([key, entryValue]) => `${printWire(key)} ${printWire(entryValue)}`,
    );
    return `{${pairs.join(" ")}}`;
  }
  if ("set" in obj && Array.isArray(obj.set)) {
    const items = (obj.set as unknown[]).map(printWire);
    return `#{${items.join(" ")}}`;
  }
  if ("list" in obj && Array.isArray(obj.list)) {
    const items = (obj.list as unknown[]).map(printWire);
    return `(${items.join(" ")})`;
  }
  if ("tag" in obj) {
    const tag = obj.tag as { ns?: string; symbol: string };
    const tagStr = tag.ns === undefined
      ? `#${tag.symbol}`
      : printTag(tag.ns, tag.symbol);
    return `${tagStr}\n${printWire(obj.value)}`;
  }
  if ("meta" in obj && "value" in obj) {
    const meta = obj.meta as Array<[unknown, unknown]>;
    const metaPairs = meta.map(([key, entryValue]) =>
      `${printWire(key)} ${printWire(entryValue)}`
    );
    return `^:{${metaPairs.join(" ")}}\n${printWire(obj.value)}`;
  }

  throw new Error(`Cannot print wire value: ${JSON.stringify(value)}`);
}

function printMetadata(metadata: unknown): string {
  if (isStringRecord(metadata)) {
    const pairs = Object.entries(metadata).map(
      ([key, entryValue]) => `${printKeyword(key)} ${printString(entryValue)}`,
    );
    return `{${pairs.join(" ")}}`;
  }
  return printWire(metadata);
}

function printExtra(extra: readonly ExtraEntry[]): string[] {
  return extra.map(([key, entryValue]) =>
    `${printWire(key)} ${printWire(entryValue)}`
  );
}

function printTaggedMap(
  tag: string,
  entries: string[],
  baseIndent: number,
): string {
  const pad = " ".repeat(baseIndent);
  const innerPad = " ".repeat(baseIndent + 1);
  if (entries.length === 0) return `${pad}${tag}\n${pad}{}`;
  if (entries.length === 1) return `${pad}${tag}\n${pad}{${entries[0]}}`;
  const [first, ...rest] = entries;
  const lines = [`${pad}${tag}`, `${pad}{${first}`];
  for (let index = 0; index < rest.length; index += 1) {
    const entry = rest[index]!;
    if (index === rest.length - 1) {
      lines.push(`${innerPad}${entry}}`);
    } else {
      lines.push(`${innerPad}${entry}`);
    }
  }
  return lines.join("\n");
}

function printInference(inf: CandidateInference, baseIndent: number): string {
  const entries: string[] = [
    `:id ${printKeyword(inf.id)}`,
    `:premises [${inf.premises.map(printKeyword).join(" ")}]`,
    `:conclusion ${printKeyword(inf.conclusion)}`,
  ];
  if (inf.rules.length > 0) {
    entries.push(`:rules [${inf.rules.map(printKeyword).join(" ")}]`);
  }
  if (inf.metadata !== undefined) {
    entries.push(`:metadata ${printMetadata(inf.metadata)}`);
  }
  entries.push(...printExtra(inf.extra));
  return printTaggedMap(printTag(THEORY_NS, "inference"), entries, baseIndent);
}

function printStatement(stmt: CandidateStatement, baseIndent: number): string {
  const entries: string[] = [`:id ${printKeyword(stmt.id)}`];
  if (stmt.text !== undefined) entries.push(`:text ${printString(stmt.text)}`);
  if (stmt.tags.length > 0) {
    entries.push(`:tags #{${stmt.tags.map(printKeyword).join(" ")}}`);
  }
  if (stmt.metadata !== undefined) {
    entries.push(`:metadata ${printMetadata(stmt.metadata)}`);
  }
  entries.push(...printExtra(stmt.extra));
  return printTaggedMap(printTag(THEORY_NS, "statement"), entries, baseIndent);
}

function printArgument(arg: CandidateArgument, baseIndent: number): string {
  const pad = " ".repeat(baseIndent);
  const innerPad = " ".repeat(baseIndent + 1);
  const entries: string[] = [`:id ${printKeyword(arg.id)}`];
  if (arg.description !== undefined) {
    entries.push(`:description ${printString(arg.description)}`);
  }
  if (arg.tags.length > 0) {
    entries.push(`:tags #{${arg.tags.map(printKeyword).join(" ")}}`);
  }
  if (arg.metadata !== undefined) {
    entries.push(`:metadata ${printMetadata(arg.metadata)}`);
  }
  entries.push(...printExtra(arg.extra));

  const mapEntries = [...entries];
  if (arg.inferences.length > 0) {
    const inferenceBlocks = arg.inferences.map((inf) =>
      printInference(inf, baseIndent + 2)
    );
    mapEntries.push(
      `:inferences\n${innerPad}[${inferenceBlocks.join("\n")}\n${innerPad}]`,
    );
  }

  if (mapEntries.length === 1) {
    return `${pad}${printTag(THEORY_NS, "argument")}\n${pad}{${mapEntries[0]}}`;
  }

  const [first, ...rest] = mapEntries;
  const lines = [`${pad}${printTag(THEORY_NS, "argument")}`, `${pad}{${first}`];
  for (let index = 0; index < rest.length; index += 1) {
    const entry = rest[index]!;
    if (index === rest.length - 1) {
      lines.push(`${innerPad}${entry}}`);
    } else {
      lines.push(`${innerPad}${entry}`);
    }
  }
  return lines.join("\n");
}

function printRelation(rel: CandidateRelation, baseIndent: number): string {
  const entries = [
    `:from ${printKeyword(rel.from)}`,
    `:to ${printKeyword(rel.to)}`,
    ...printExtra(rel.extra),
  ];
  return printTaggedMap(printTag(THEORY_NS, rel.kind), entries, baseIndent);
}

function printElement(element: CandidateElement, baseIndent: number): string {
  switch (element.kind) {
    case "statement":
      return printStatement(element, baseIndent);
    case "argument":
      return printArgument(element, baseIndent);
    default:
      return printRelation(element, baseIndent);
  }
}

export function writeEdn(doc: CandidateDocument): string {
  const elements = doc.elements.map((element) => printElement(element, 2)).join(
    "\n\n",
  );
  return `${printTag(ROOT_NS, "grounded")}\n[\n${elements}\n]`;
}
