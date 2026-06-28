// src/cli/mcp.ts
// `argdown mcp` — start a Model Context Protocol (MCP) server on stdio that
// exposes the Argdown parser, validator, renderer, solver, and stringifier as
// tools. The host (e.g., an AI agent) drives the protocol; this module just
// registers the handlers and pumps messages over `process.stdin` /
// `process.stdout`.
//
// The server registers 5 tools — one per CLI subcommand — so an MCP client
// can do anything the CLI can, but driven by JSON-RPC rather than argv
// strings. Output is plain JSON (no stdout/stderr distinction is possible
// inside a single MCP `CallToolResult`, so we route both kinds of diagnostic
// into the structured result).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { parse, formatError } from '../parser.js';
import { renderMermaid } from '../mermaid.js';
import { stringify } from '../stringifier.js';
import {
  solve, solveBipolar, solveEvidential,
  solvePreferred, solvePreferredBipolar, solvePreferredEvidential,
  solveStable, solveStableBipolar, solveStableEvidential,
  solveComplete, solveCompleteBipolar, solveCompleteEvidential,
  type MultiSolveResult,
  type Label,
} from '../solver.js';
import {
  solveAspic,
  solvePreferredAspic,
  solveStableAspic,
  solveCompleteAspic,
} from '../solver-aspic.js';

export const COMMAND = 'mcp';
export const DESCRIPTION =
  'Start an MCP (Model Context Protocol) server on stdio exposing parse, validate, render_mermaid, solve, and format tools';

const VALID_SEMANTICS = [
  'dung', 'bipolar', 'aspic', 'evidential',
  'preferred', 'preferred-bipolar', 'preferred-aspic', 'preferred-evidential',
  'stable', 'stable-bipolar', 'stable-aspic', 'stable-evidential',
  'complete', 'complete-bipolar', 'complete-aspic', 'complete-evidential',
] as const;

type MultiSemantics = Extract<(typeof VALID_SEMANTICS)[number],
  'preferred' | 'preferred-bipolar' | 'preferred-aspic' | 'preferred-evidential'
  | 'stable' | 'stable-bipolar' | 'stable-aspic' | 'stable-evidential'
  | 'complete' | 'complete-bipolar' | 'complete-aspic' | 'complete-evidential'>;

const MULTI_PREFIXES = ['preferred', 'stable', 'complete'] as const;

function isMulti(semantics: string): semantics is MultiSemantics {
  return MULTI_PREFIXES.some((p) => semantics === p || semantics.startsWith(`${p}-`));
}

function dispatchMulti(semantics: MultiSemantics, ast: import('../ast.js').Document): MultiSolveResult {
  switch (semantics) {
    case 'preferred': return solvePreferred(ast);
    case 'preferred-bipolar': return solvePreferredBipolar(ast);
    case 'preferred-aspic': return solvePreferredAspic(ast);
    case 'preferred-evidential': return solvePreferredEvidential(ast);
    case 'stable': return solveStable(ast);
    case 'stable-bipolar': return solveStableBipolar(ast);
    case 'stable-aspic': return solveStableAspic(ast);
    case 'stable-evidential': return solveStableEvidential(ast);
    case 'complete': return solveComplete(ast);
    case 'complete-bipolar': return solveCompleteBipolar(ast);
    case 'complete-aspic': return solveCompleteAspic(ast);
    case 'complete-evidential': return solveCompleteEvidential(ast);
  }
}

/**
 * JSON-stringify-friendly view of a grounded `SolveResult`. The `Map` types in
 * the solver result don't survive `JSON.stringify` (they serialise to `{}`),
 * so we expand them into `Record`s before returning to the MCP client.
 */
type GroundedResultJson = {
  semantics: 'dung' | 'bipolar' | 'aspic' | 'evidential';
  labels: Record<string, Label>;
  groups: Record<Label, string[]>;
  warnings: string[];
};

type MultiResultJson = {
  semantics: MultiSemantics;
  extensions: string[][];
  warnings: string[];
};

function groundedToJson(
  semantics: 'dung' | 'bipolar' | 'aspic' | 'evidential',
  solved: { labels: Map<string, Label>; warnings: string[] },
): GroundedResultJson {
  const labels: Record<string, Label> = {};
  for (const [k, v] of solved.labels) labels[k] = v;
  const groups: Record<Label, string[]> = { in: [], out: [], undec: [] };
  for (const [k, v] of solved.labels) groups[v].push(k);
  for (const v of ['in', 'out', 'undec'] as const) groups[v].sort();
  return { semantics, labels, groups, warnings: solved.warnings };
}

function multiToJson(semantics: MultiSemantics, solved: MultiSolveResult): MultiResultJson {
  return {
    semantics,
    extensions: solved.extensions.map((ext) => [...ext].sort()),
    warnings: solved.warnings,
  };
}

/**
 * Build a structured error view of a parse failure. `formatError` only gives
 * us a human-readable string, but the MCP layer wants the full struct so
 * clients can render their own UIs / filter on `code`. The pre-formatted
 * `message` is preserved alongside the raw fields.
 */
function parseErrorsToJson(
  errors: import('../parser.js').ParseError[],
  label: string,
): {
  message: string;
  code: string;
  severity: 'error' | 'warning';
  loc: { line: number; column: number; offset: number };
  expected: string[] | undefined;
  found: string | undefined;
}[] {
  return errors.map((e) => ({
    message: formatError(e, label),
    code: e.code,
    severity: e.severity,
    loc: e.loc,
    expected: e.expected,
    found: e.found,
  }));
}

/**
 * Build the MCP server. Pulled out of `run` so the test suite can construct
 * one against an `InMemoryTransport` without touching stdin/stdout.
 */
export function buildServer(): McpServer {
  const server = new McpServer(
    { name: 'argdown', version: '0.0.0' },
    { capabilities: { tools: {} } },
  );

  // ----- parse -----
  // Returns the parsed AST as JSON, or the structured parse-error list on
  // failure. Errors are surfaced in the result object (not as a tool error)
  // so the client can distinguish "couldn't parse" from "server crashed".
  server.registerTool(
    'parse',
    {
      title: 'Parse Argdown source',
      description:
        'Parse an Argdown document and return the AST as JSON. On parse failure, returns the structured error list with `ok: false`.',
      inputSchema: {
        source: z.string().describe('The Argdown source text to parse.'),
        filename: z.string().optional().describe(
          'Optional filename used in error messages and source locations.',
        ),
      },
    },
    ({ source, filename }) => {
      const label = filename ?? '<anonymous>';
      const result = parse(source, filename !== undefined ? { filename } : {});
      if (result.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, ast: result.ast }) }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: false, errors: parseErrorsToJson(result.errors, label) }) }],
      };
    },
  );

  // ----- validate -----
  // CI-style "is this valid?" gate. Tool result `isError` is true iff parsing
  // failed — the human-readable error lines go in the `content` array.
  server.registerTool(
    'validate',
    {
      title: 'Validate Argdown source',
      description:
        'Parse an Argdown document. Returns `ok: true` on success and `ok: false` with formatted error lines on failure.',
      inputSchema: {
        source: z.string().describe('The Argdown source text to validate.'),
        filename: z.string().optional().describe(
          'Optional filename used in error messages.',
        ),
      },
    },
    ({ source, filename }) => {
      const label = filename ?? '<stdin>';
      const result = parse(source, filename !== undefined ? { filename } : {});
      if (result.ok) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, errorCount: 0 }) }],
        };
      }
      return {
        isError: true,
        content: [{
          type: 'text',
          text: JSON.stringify({
            ok: false,
            errorCount: result.errors.length,
            errors: parseErrorsToJson(result.errors, label),
          }),
        }],
      };
    },
  );

  // ----- render_mermaid -----
  // Parse + emit a Mermaid `flowchart TD` to stdout-equivalent.
  server.registerTool(
    'render_mermaid',
    {
      title: 'Render Mermaid flowchart',
      description:
        'Parse an Argdown document and return a Mermaid `flowchart TD` string.',
      inputSchema: {
        source: z.string().describe('The Argdown source text to render.'),
        filename: z.string().optional().describe('Optional filename used in error messages.'),
      },
    },
    ({ source, filename }) => {
      const result = parse(source, filename !== undefined ? { filename } : {});
      if (!result.ok) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              errorCount: result.errors.length,
              errors: parseErrorsToJson(result.errors, filename ?? '<anonymous>'),
            }),
          }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, mermaid: renderMermaid(result.ast) }) }],
      };
    },
  );

  // ----- solve -----
  // The 16-semantics dispatch. `validate` happens up front so we never return
  // a half-computed solver result over a malformed AST.
  server.registerTool(
    'solve',
    {
      title: 'Run an argumentation semantics',
      description:
        'Parse an Argdown document, run a semantics, and return either a grounded IN/OUT/UNDEC label summary or the multi-extension set. `semantics` defaults to "dung".',
      inputSchema: {
        source: z.string().describe('The Argdown source text to solve.'),
        semantics: z.enum(VALID_SEMANTICS).optional().describe(
          'The semantics to run. One of the 16 supported values. Defaults to "dung".',
        ),
        filename: z.string().optional().describe('Optional filename used in error messages.'),
      },
    },
    ({ source, semantics, filename }) => {
      const result = parse(source, filename !== undefined ? { filename } : {});
      if (!result.ok) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              errorCount: result.errors.length,
              errors: parseErrorsToJson(result.errors, filename ?? '<anonymous>'),
            }),
          }],
        };
      }
      const chosen: (typeof VALID_SEMANTICS)[number] = semantics ?? 'dung';
      if (isMulti(chosen)) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ ok: true, result: multiToJson(chosen, dispatchMulti(chosen, result.ast)) }),
          }],
        };
      }
      // Grounded extension: dung | bipolar | aspic | evidential.
      const grounded = chosen === 'bipolar' ? solveBipolar(result.ast)
        : chosen === 'aspic' ? solveAspic(result.ast)
        : chosen === 'evidential' ? solveEvidential(result.ast)
        : solve(result.ast);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ ok: true, result: groundedToJson(chosen, grounded) }),
        }],
      };
    },
  );

  // ----- format -----
  // Parse + round-trip through the stringifier. Used as a normalisation step.
  server.registerTool(
    'format',
    {
      title: 'Format Argdown source',
      description:
        'Parse an Argdown document and emit the round-tripped source via the stringifier. On parse failure returns the structured error list.',
      inputSchema: {
        source: z.string().describe('The Argdown source text to format.'),
        filename: z.string().optional().describe('Optional filename used in error messages.'),
      },
    },
    ({ source, filename }) => {
      const result = parse(source, filename !== undefined ? { filename } : {});
      if (!result.ok) {
        return {
          isError: true,
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: false,
              errorCount: result.errors.length,
              errors: parseErrorsToJson(result.errors, filename ?? '<anonymous>'),
            }),
          }],
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify({ ok: true, source: stringify(result.ast) }) }],
      };
    },
  );

  return server;
}

export async function run(argv: string[], binaryName: string): Promise<number> {
  // Reject any trailing argv we don't understand — `argdown mcp` takes no
  // options yet, but we'd rather surface a useful error than ignore a
  // mistaken flag.
  if (argv.length > 0) {
    process.stderr.write(
      `${binaryName}: ${COMMAND} takes no arguments (got: ${argv.join(' ')})\n`,
    );
    return 2;
  }
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // The stdio transport doesn't auto-detect EOF on stdin (it only listens for
  // `data` events), so we wire our own `end` listener. When the host closes
  // our stdin — the normal shutdown pattern for an MCP server child process
  // — we tear down the server and let `run` return 0. The `server.server`
  // `onclose` is also wired to resolve the await, so a programmatic
  // `server.close()` from a signal handler would work the same way.
  const closed = new Promise<void>((resolve) => {
    server.server.onclose = () => resolve();
  });
  process.stdin.once('end', () => {
    void server.close();
  });
  // Also handle SIGTERM / SIGINT so a ctrl-C in a parent terminal doesn't
  // leave the server hung. These are advisory — the host is expected to close
  // stdin rather than signal, but we don't want to leak processes either.
  const onSignal = (): void => {
    void server.close();
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);
  await closed;
  process.off('SIGTERM', onSignal);
  process.off('SIGINT', onSignal);
  return 0;
}
