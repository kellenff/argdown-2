export const VERSION = "0.2.0";

export const HELP = `argdown-2 ${VERSION}

Load, validate, solve, and render EDN argument-graph documents.

Usage:
  argdown-2 [flags] <path|->

Arguments:
  <path|->                  EDN file path, or '-' for stdin.

Flags:
  --format=<table|dot|mermaid|json>
                             Output format (default: table).
  --dry-run                 Validate only; skip solve and render.
                             Silent on success; stderr + exit 1 on error.
  --quiet                   Suppress diagnostics on stderr.
  --help                    Print this help and exit 0.
  --version                 Print version and exit 0.

Output:
  table       Markdown-flavored; per-solver headings
              (## solver/<tag>, ### IN / ### OUT / ### UNDETERMINED).
              Empty groups omitted. Default.
  dot         Graphviz DOT with nested subgraphs per solver.
  mermaid     Mermaid markdown with nested subgraphs per solver.
  json        EDN-shaped JSON with per-component labels and per-statement
              labels threaded through. Machine-parseable.

Exit codes:
  0   Success
  1   Parse / validation / solve error (diagnostics on stderr)
  2   Usage error (unknown flag, missing path)

Examples:
  argdown-2 foo.edn
  argdown-2 --format=dot foo.edn > foo.dot
  argdown-2 --dry-run foo.edn
  cat foo.edn | argdown-2 -

Solver semantics are read from the document's per-component solver tags
(#casualtheorics.argdown2.solver/grounded, .../bipolar, .../evidential,
etc.). There is no --semantics flag.
`;
