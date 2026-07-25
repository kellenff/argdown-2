# `interactive-argument` Skill Design

**Date:** 2026-07-24
**Status:** Approved (cloud agent; task request is the approval)
**Scope:** A host-LLM skill that interactively develops an argument from freeform
prose **or** an existing argdown-2 EDN graph, using MCP builder tools only, with
an explicit confirmation gate before dispatching research agents for citations.
Canonical location: `plugins/argdown-2/skills/interactive-argument/SKILL.md`.

---

## 1. Context and goals

Existing skills cover:

| Skill | Job |
|---|---|
| `prose-to-argdown-2` | One-shot grounded extraction from prose |
| `build-graph` | MCP mutation mechanics |
| `validate-debug` | Repair via MCP |
| `interpret-solve` | Labels / extensions |

What is missing is a **collaborative development loop**: start from a seed
(prose thesis or thin graph), sharpen through dialogue (clarification, direction,
user-supplied citations, context), and — only with explicit confirmation —
dispatch research agents to find credible sources to cite as `authority`
statements.

**Goals**

- One skill at `plugins/argdown-2/skills/interactive-argument/SKILL.md`.
- Accept prose **or** existing argdown-2 (`path` / MCP session / threaded `source`).
- Interactive: **one** clarifying or directional move per turn.
- MCP-only mutations; never hand-edit `*.edn`.
- Research dispatch requires an explicit yes to a proposed research brief
  ("confirmation is implied" is **not** enough).
- Cite research as `authority` statements + `support`/`attack` relations;
  never invent study titles, DOIs, or quotes.
- Compose with sibling skills; do not replace one-shot extraction.

**Non-goals**

- Replacing `prose-to-argdown-2` for dump-and-extract requests.
- Automating research without a confirmation gate.
- Restoring legacy `.argdown` surface syntax.
- Building a separate research MCP server in this cycle (use host Task / Exa /
  web tools available to the agent).

---

## 2. Decisions summary

| Concern | Decision |
|---|---|
| Skill name / path | `interactive-argument` under `plugins/argdown-2/skills/` |
| Starting points | Prose seed, existing EDN path/session, or thin thesis sentence |
| Bootstrap from prose | Optional handoff to `prose-to-argdown-2` when user wants grounded extraction first; otherwise seed 1–2 claims via `build-graph` and enter the loop |
| Interaction cadence | Exactly one primary question or confirmation ask per agent turn |
| Research gate | Propose brief → wait for explicit affirmative → then dispatch |
| Citation modeling | `authority` tagged statements; bipolar/evidential when `support` needed |
| Credibility bar | Prefer primary / peer-reviewed / official sources; record URL + retrieve date in chat ledger |
| Packaging | Same skill tree; extend `SKILLS` arrays in Claude/Pi tests |
| EDN | MCP only; refuse Write/Edit fallback |

---

## 3. Interaction move types

| Move | When | Outcome |
|---|---|---|
| Clarify | Ambiguous claim, scope, quantifiers, time bound | Narrow statement text / tags |
| Direction | Multiple flanks possible | Choose which support/attack to develop next |
| User citation | User has a source | Add `authority` + relation from user-provided cite |
| Context | Audience, purpose, constraints | Tag or annotate strategy; may reshape thesis |
| Challenge | Graph is one-sided | Propose steelman objection; ask whether to add |
| Research brief | Gaps need external evidence | Gate → dispatch → cite |
| Solve check | Structure stable enough | `validate` → `solve` → `interpret-solve` |

---

## 4. Research confirmation contract

Before any research agent / web search for citations:

1. State the claim id(s) that need evidence.
2. Propose a short research brief (queries, source types, max agents).
3. Ask: proceed / refine brief / skip.
4. Only on explicit proceed: dispatch.
5. On return: present candidate sources; add only those the user accepts (or that
   the brief already authorized auto-attach for). Default: present then attach
   after a quick confirm when sources are contentious.

---

## 5. Baseline (RED) failures addressed

Pressure scenarios without the skill showed agents:

- Batching / deferring clarifying questions to "finish the graph this turn"
- Treating "confirmation is implied" as a research go-ahead
- Attempting one-shot complete graphs under interactive framing

The skill forbids those explicitly (red flags + rationalization table).

---

## 6. Packaging / verification

- Shape tests in `src/interactive-argument-skill.test.ts`
- Register name in `src/claude-plugin.test.ts` and `src/pi-package.test.ts` `SKILLS`
- Mention in README plugin skills list
- `MANUAL.md` smoke steps for prose-start and path-start + research gate
