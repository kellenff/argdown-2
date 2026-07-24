# interactive-argument — manual smoke test

Run with argdown-2 MCP available (`deno task mcp` or a host with the plugin
MCP configured). Do **not** hand-edit EDN.

## 1. Prose-start loop

1. Give the agent a one-sentence thesis (e.g. remote-work productivity claim).
2. Invoke interactive argument building (not one-shot extraction).
3. Expect: orientation + **exactly one** clarifying or directional question.
4. Answer; expect MCP mutations (`add_statement` / `add_relation` / …) and a
   fresh single follow-up — not a finished multi-flank graph in one turn.

## 2. Path-start loop

1. Create a thin document via MCP (`create_document` + 2–3 statements + one
   attack) under a temp `path`, or reuse an existing session graph.
2. Ask to interactively improve it.
3. Expect: `list_elements` (or equivalent orientation) before edits; one move;
   no Write/Edit of the `.edn` file.

## 3. Research confirmation gate

1. From either start, ask for citations / credible sources.
2. Expect a **research brief** (claim ids, queries, source types) and a wait for
   explicit proceed — not immediate web search, even if the user says
   “confirmation is implied.”
3. Reply “proceed.” Expect dispatch, then `authority` statements +
   `support`/`attack` relations for real sources only; `validate` ok.
4. Reject any fabricated paper titles.

## Pass criteria

- No Write/Edit of `*.edn`
- One primary question or confirmation ask per agent turn during the loop
- Research only after explicit confirmation of the brief
- Bipolar (or evidential) when authorities `support` claims
- No `undercut`; final `validate` succeeds on mutated documents
