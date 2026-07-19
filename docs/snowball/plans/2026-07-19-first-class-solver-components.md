# First-Class Solver Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nested-solvers POC with identified, inline solver components in a tagged document map, scoped relation identity, typed boundary confidence, and bottom-up grounded composition.

**Architecture:** Decode EDN into a recursive candidate tree, validate each solver's local endpoint scope, preserve relations as identified records, then evaluate components post-order. Child components publish immutable confidence boundaries; grounded parents import them as proxy nodes without feeding parent state back into children.

**Tech Stack:** TypeScript, Deno, Zod, `edn-parser-js`, stdio MCP SDK, Dung grounded and multi-extension algorithms.

---

## File Structure

- `src/model.ts`: canonical candidate/validated component tree and result types.
- `src/schema.ts`: document, solver, interface, projection, and relation decoding.
- `src/validate.ts`: local scope, endpoint, selectability, and import validation.
- `src/component-eval.ts`: post-order component evaluation and boundary observers.
- `src/reduce-dung.ts`: identified local relations and grounded proxy import.
- `src/reduce-bipolar.ts`, `src/reduce-evidential.ts`: leaf component reductions.
- `src/edn-write.ts`: canonical document-map serialization.
- `src/builder/*`: root-scoped authoring and interface bootstrap.
- `src/mcp/*`: new wire and solve result serialization.
- `src/*.test.ts`: red/green contract and semantic tests.
- `examples/*.edn`, `src/**/*.edn`: migrated canonical fixtures.

### Task 1: Model and wire contract

**Files:**
- Modify: `src/model.ts`
- Modify: `src/schema.ts`
- Replace: `src/nested-solvers.test.ts`
- Modify: `src/schema.test.ts`

- [ ] Write failing tests for `#casualtheorics.argdown2/document`, identified solver maps, unary identity interfaces, relation IDs, mixed-depth components, and rejection of legacy bare solver roots.
- [ ] Run `deno test -A src/schema.test.ts src/nested-solvers.test.ts` and confirm failures are caused by the old vector-root decoder.
- [ ] Introduce `CandidateDocument`, `CandidateSolverComponent`, `SolverInterface`, identified `CandidateRelation`, `Confidence`, and component result types.
- [ ] Decode document and solver maps recursively; decode identity aggregate, extension observer, and parent threshold imports.
- [ ] Run focused tests and commit.

### Task 2: Scoped validation

**Files:**
- Modify: `src/validate.ts`
- Modify: `src/validate.test.ts`

- [ ] Write failing tests for local ID uniqueness, sibling ID reuse, parent visibility of child IDs, hidden child internals, relation endpoints, interface selectability, and threshold import validation.
- [ ] Run focused tests and confirm expected semantic failures.
- [ ] Build one local endpoint index per component; recursively validate child components without parent pointers.
- [ ] Validate current solver endpoint capabilities separately from structural reference resolution.
- [ ] Reject composite non-grounded parents until adapters are specified.
- [ ] Run focused tests and commit.

### Task 3: Bottom-up grounded evaluation

**Files:**
- Create: `src/component-eval.ts`
- Create: `src/component-eval.test.ts`
- Modify: `src/reduce-dung.ts`
- Modify: `src/index.ts`
- Modify: `src/index.test.ts`
- Modify: `src/solvers.test.ts`

- [ ] Write failing tests for native/aggregate/boundary results and `IN → 1`, `OUT → 0`, `UNDEC → nil`.
- [ ] Write failing tests for post-order child evaluation and grounded proxy constructions for `1`, `0`, and `nil`.
- [ ] Run focused tests and confirm failures.
- [ ] Implement unary identity selection, observers, threshold projection, private proxy expansion, and post-order fold.
- [ ] Preserve native leaf solver behavior; use extension proportion only when explicitly declared.
- [ ] Run focused tests and commit.

### Task 4: Other reducers and canonical writer

**Files:**
- Modify: `src/reduce-bipolar.ts`
- Modify: `src/reduce-evidential.ts`
- Modify: `src/edn-write.ts`
- Modify: `src/edn-write.test.ts`

- [ ] Write failing leaf-solver and round-trip tests using the new document map.
- [ ] Run focused tests and confirm failures.
- [ ] Adapt reducers to solver components and emit document/solver/interface/import/relation maps.
- [ ] Run focused tests and commit.

### Task 5: Builder and MCP lifecycle

**Files:**
- Modify: `src/builder/apply.ts`
- Modify: `src/builder/types.ts`
- Modify: `src/builder/resolve-ref.ts`
- Modify: `src/builder/soft-parse.ts`
- Modify: `src/builder/*.test.ts`
- Modify: `src/mcp/io.ts`
- Modify: `src/mcp/tools.ts`
- Modify: `src/mcp/server.ts`
- Modify: `src/mcp/*.test.ts`

- [ ] Write failing tests for document bootstrap, first-statement interface materialization, relation IDs, relation removal by ID, list output, and solve serialization.
- [ ] Run focused tests and confirm failures.
- [ ] Allow pending interfaces only in builder soft parsing; strict load rejects them.
- [ ] Keep existing tool names and path/source transport while adding optional document/root/relation IDs.
- [ ] Run focused tests and commit.

### Task 6: Fixture and documentation migration

**Files:**
- Modify: `examples/argdown1-censorship.edn`
- Modify: `src/bench.fixtures/*.edn`
- Modify: `src/builder/fixtures/*.edn`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `plugins/argdown-2/skills/build-graph/SKILL.md`
- Modify: remaining tests embedding legacy EDN

- [ ] Migrate every active EDN source to the tagged document map.
- [ ] Assign deterministic relation IDs and identity interface refs.
- [ ] Update user-facing examples and mark the POC design superseded.
- [ ] Run full `deno task test`, `check`, `lint`, and `fmt:check`.
- [ ] Run the MCP create → mutate → validate → solve probe.
- [ ] Commit and push final migration.
