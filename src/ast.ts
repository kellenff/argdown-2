// src/ast.ts
// Discriminated-union AST node types for Argdown Extended.
// Pure types — no runtime imports, no logic. The leaf of the dep graph.

// ----- Shared -----

export type Position = {
  line: number; // 1-indexed (IDE convention)
  column: number; // 1-indexed
  offset: number; // 0-indexed (UTF-16 code unit)
};

export type SourceLocation = {
  start: Position;
  end: Position;
};

export interface BaseNode {
  loc: SourceLocation;
}

// ----- Top-level -----

export type Document = {
  kind: 'Document';
  frontmatter?: Frontmatter;
  elements: Element[];
  loc: SourceLocation;
};

export type Element =
  | Heading
  | Block
  | FactStatement
  | RuleStatement
  | RelationStatement
  | LineComment
  | BlockComment;

// ----- Frontmatter -----

export type Frontmatter = {
  kind: 'Frontmatter';
  entries: Record<string, Value | PlainScalar>;
  loc: SourceLocation;
};

// ----- Heading -----

export type Heading = {
  kind: 'Heading';
  level: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  loc: SourceLocation;
};

// ----- Block -----

export type BlockType = 'meta' | 'evidence' | 'position' | 'stakeholder' | 'domain';

export type BlockTitle = {
  kind: 'BlockTitle';
  text: string;
  loc: SourceLocation;
};

export type Block = {
  kind: 'Block';
  type: BlockType;
  title?: BlockTitle;
  body: BlockLine[];
  loc: SourceLocation;
};

export type BlockLine = YamlLine | ListItem | Element;

export type ListItem = {
  kind: 'ListItem';
  fact: Fact;
  loc: SourceLocation;
};

// ----- Fact -----

export type FactStatement = {
  kind: 'FactStatement';
  fact: Fact;
  loc: SourceLocation;
};

export type Fact = {
  kind: 'Fact';
  ref: FactRef;
  claimText?: string;
  attributes?: AttributeBlock;
  loc: SourceLocation;
};

export type FactRef = {
  kind: 'FactRef';
  head: FactHead;
  loc: SourceLocation;
};

export type FactHead = IdentifierHead | TitleHead;

export type IdentifierHead = {
  kind: 'IdentifierHead';
  identifier: string;
  loc: SourceLocation;
};

export type TitleHead = {
  kind: 'TitleHead';
  title: string;
  loc: SourceLocation;
};

// ----- Rule -----

export type RuleStatement = {
  kind: 'RuleStatement';
  rule: Rule;
  loc: SourceLocation;
};

export type Rule = {
  kind: 'Rule';
  ref: FactRef;
  premises: FactRef[];
  loc: SourceLocation;
};

// ----- Relation -----

export type Arrow =
  | 'support'
  | 'attack'
  | 'undercut'
  | 'undermine'
  | 'concession'
  | 'qualification'
  | 'equivalence';

export type RelationStatement = {
  kind: 'RelationStatement';
  relation: Relation;
  loc: SourceLocation;
};

export type Relation = {
  kind: 'Relation';
  from: RelationEndpoint;
  arrow: Arrow;
  to: RelationEndpoint;
  attributes?: AttributeBlock;
  loc: SourceLocation;
};

export type RelationEndpoint = FactRef | RuleExpr;

export type RuleExpr = {
  kind: 'RuleExpr';
  rule: Rule;
  loc: SourceLocation;
};

// ----- Attributes -----

export type AttributeBlock = {
  kind: 'AttributeBlock';
  entries: Record<string, Value>;
  loc: SourceLocation;
};

// ----- Comments -----

export type LineComment = {
  kind: 'LineComment';
  text: string;
  loc: SourceLocation;
};

export type BlockComment = {
  kind: 'BlockComment';
  text: string;
  loc: SourceLocation;
};

// ----- Values -----

export type Value =
  | StringValue
  | NumberValue
  | BooleanValue
  | NullValue
  | FlowSequence
  | FlowMapping
  | FlowScalar;

export type StringValue = {
  kind: 'StringValue';
  value: string;
  loc: SourceLocation;
};

export type NumberValue = {
  kind: 'NumberValue';
  value: number;
  loc: SourceLocation;
};

export type BooleanValue = {
  kind: 'BooleanValue';
  value: boolean;
  loc: SourceLocation;
};

export type NullValue = {
  kind: 'NullValue';
  loc: SourceLocation;
};

export type FlowSequence = {
  kind: 'FlowSequence';
  items: Value[];
  loc: SourceLocation;
};

export type FlowMapping = {
  kind: 'FlowMapping';
  entries: Record<string, Value>;
  loc: SourceLocation;
};

export type FlowScalar = {
  kind: 'FlowScalar';
  text: string;
  loc: SourceLocation;
};

// ----- YAML -----

export type YamlLine = {
  kind: 'YamlLine';
  key: string;
  value: YamlValue;
  loc: SourceLocation;
};

export type YamlValue = FlowSequence | StringValue | PlainScalar | null;

export type PlainScalar = {
  kind: 'PlainScalar';
  text: string;
  loc: SourceLocation;
};
