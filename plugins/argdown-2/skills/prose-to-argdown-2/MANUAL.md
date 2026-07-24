# prose-to-argdown-2 — manual smoke test

Run with argdown-2 MCP available (`deno task mcp` or a host with the plugin
MCP configured). Do **not** hand-edit EDN.

## 1. Lead essay

1. Open `fixtures/lead-essay/input.txt`.
2. Invoke the skill (ask the agent to map the argument / turn into argdown-2).
3. Expect: bipolar document; ≥6 statements; ≥4 relations; ≥1 argument/inference;
   provenance table with verbatim quotes; final `validate` ok.
4. Optional: `solve` and skim labels.

## 2. Research abstract

1. Open `fixtures/research-abstract/input.txt`.
2. Expect Pass 3 to fire on “We argue that … because …” and the “implies” sentence.
3. Expect provenance hits on those spans.

## 3. No-claims refusal

1. Open `fixtures/no-claims/input.txt`.
2. Expect a plain refusal; no `create_document`.

## 4. Legal-opinion smoke (Terry)

1. Open `fixtures/legal-opinion-terry/input.txt` (Terry v. Ohio excerpt).
2. Expect bipolar; separate `fact` vs `holding`; authority statements with
   verbatim cites (Katz, Warden, Beck, Brinegar, Stacey at minimum).
3. `See` / `cf.` clusters must yield support edges (or conscious omission).
4. No invented doctrinal elements beyond the excerpt.

## 5. Legal-brief smoke

1. Open `fixtures/legal-brief-terry/input.txt`.
2. Expect STATEMENT OF FACTS vs ARGUMENT separation; WHEREFORE as `relief`;
   point headings as candidate conclusions; `See Terry v. Ohio…` captured.

## Pass criteria

- No Write/Edit of `*.edn`
- Solver matches relation kinds (no support under grounded; no undercut)
- Every ledger quote is a substring of the fixture input
- `validate` succeeds on built documents
- For legal fixtures: cite strings match character-for-character; facts ≠ holdings
