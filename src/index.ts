// src/index.ts
// Public API surface.

export { parse, formatError } from './parser.js';
export type { ParseResult, ParseOptions, ParseError, ParseErrorCode } from './parser.js';

export { renderMermaid } from './mermaid.js';

export { stringify } from './stringifier.js';
export type { StringifyOptions } from './stringifier.js';

export {
  solve,
  solveBipolar,
  solveEvidential,
  solvePreferred,
  solvePreferredBipolar,
  solvePreferredEvidential,
  solveStable,
  solveStableBipolar,
  solveStableEvidential,
  solveComplete,
  solveCompleteBipolar,
  solveCompleteEvidential,
  type MultiSolveResult,
} from './solver.js';
export { solveAspic } from './solver-aspic.js';
export {
  solvePreferredAspic,
  solveStableAspic,
  solveCompleteAspic,
} from './solver-aspic.js';
export type { SolveResult, Label } from './solver.js';

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
