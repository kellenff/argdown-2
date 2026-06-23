// src/index.ts
// Public API surface.

export { parse, formatError } from './parser.js';
export type { ParseResult, ParseOptions, ParseError, ParseErrorCode } from './parser.js';

export { renderMermaid } from './mermaid.js';

export type {
  Document,
  Frontmatter,
  Heading,
  Block,
  BlockLine,
  BlockTitle,
  ListItem,
  FactStatement,
  RelationStatement,
  Fact,
  FactRef,
  FactHead,
  IdentifierHead,
  TitleHead,
  Argument,
  Conclusion,
  Premise,
  Relation,
  RelationEndpoint,
  Arrow,
  AttributeBlock,
  Value,
  StringValue,
  NumberValue,
  BooleanValue,
  NullValue,
  FlowSequence,
  FlowMapping,
  FlowScalar,
  YamlLine,
  YamlValue,
  PlainScalar,
  LineComment,
  BlockComment,
  BlockType,
  Element,
  SourceLocation,
  Position,
} from './ast.js';
