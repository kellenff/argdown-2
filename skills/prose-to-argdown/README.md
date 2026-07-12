# prose-to-argdown

A snowball skill that distills argumentative or research/technical prose into a full argdown-2 document, with strict provenance and grounded arguments.

## What it does

Given a block of prose, the skill:

1. Extracts every atomic claim with `source-line` + `source-quote` provenance.
2. Identifies support/attack/undercut relations between claims.
3. Extracts argument structures the prose states or strongly implies.
4. Validates the output by parsing and rendering through argdown-2's MCP server.
5. Delivers the result as an inline `argdown` code block.

It does **not** invent arguments beyond what the prose says.

## Requirements

- argdown-2 v0.1.0-alpha1 or later, installed with its MCP server registered as `argdown` in your agent host config. See [argdown-2's README](https://github.com/kellenff/argdown-2) for setup.
- A snowball skill loader (Claude Code, Copilot CLI, Aider, Gemini CLI, VTCode, etc.)

## Installation

This skill ships inside the `argdown-2` repo. To use it from another project, ensure the argdown-2 repo is on your machine (or symlink `skills/prose-to-argdown/` into your project's `.agents/skills/` directory). Snowball-compatible loaders discover `SKILL.md` automatically.

```bash
# Inside the argdown-2 repo (skills live at skills/prose-to-argdown/, project-local)
# — no install step needed; the loader picks up the SKILL.md on next session start.

# For use from another project, symlink the skill into that project's .agents/skills:
ln -s /path/to/argdown-2/skills/prose-to-argdown /path/to/your-project/.agents/skills/prose-to-argdown
```

## Triggering the skill

Paste prose in chat and ask any of:

- "extract the claims from this essay"
- "map the argument in this paper"
- "turn this into argdown"
- "what is this arguing"
- "structure this op-ed"

The skill handles argumentative prose (essays, op-eds, reviews, polemics, position papers) and research/technical prose (paper sections, technical reports, book excerpts).

## Verifying the skill

See `MANUAL.md` for the step-by-step smoke test against the bundled fixtures. Run `skills/prose-to-argdown/scripts/verify-fixture.sh` from the argdown-2 repo root to validate every fixture's expected.argdown parses cleanly.

## Project layout

This skill ships inside the `argdown-2` repo at three host-specific paths plus a fixtures tree:

```
argdown-2/
├── skills/prose-to-argdown/            # snowball skill (source of truth)
│   ├── SKILL.md
│   ├── README.md (this file)
│   ├── MANUAL.md                        # smoke test instructions
│   ├── scripts/
│   │   ├── verify-fixture.sh            # runs argdown validate on expected.argdown
│   │   └── run-skill.sh                 # helper for invoking the skill
│   └── fixtures/                        # one directory per test fixture
│       ├── lead-essay/                  # 150-word climate op-ed
│       ├── research-abstract/           # paper abstract with "we argue that X"
│       ├── position-disagreement/       # two voices arguing
│       ├── no-claims/                   # recipe (tests early-exit)
│       ├── multi-paragraph/             # 1,500-word essay with sections
│       ├── ambiguous-prose/             # facts only, no arguments
│       └── legacy-syntax/               # prose mentioning ':—' syntax
├── .pi/extensions/prose-to-argdown.ts   # pi-coding-agent adapter
├── .claude-plugin/plugin.json           # Claude Code plugin manifest
└── commands/prose-to-argdown.md          # Claude Code slash command
```

## License

Private.
