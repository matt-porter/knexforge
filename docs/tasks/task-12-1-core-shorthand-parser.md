## Handoff Prompt: Task 12.1 Core Shorthand Parser

Continue from current `main` and complete the core Python shorthand parser.

### Objective
Implement `src/core/shorthand_parser.py` to parse Graphviz-style shorthand into `topology-v1` data with strict diagnostics.

### Current Status
Frontend compact parser/formatter exists; core parser in Python remains pending.

### Required Scope
1. Implement grammar supporting `--` fixed and `~~` revolute edges.
2. Parse declarations into topology parts/connections only (no transforms).
3. Return structured parse errors for syntax and semantic issues.
4. Add API-ready typed models for parser output and diagnostics.

### Tests And Validation
1. Add pytest coverage for happy paths, malformed syntax, unknown symbols, and duplicate declarations.
2. Add parser compatibility tests against representative frontend compact examples.
3. Run focused core test suite for parser module.

### Constraints
1. Keep parser in core Python layer; do not move logic to frontend.
2. Preserve deterministic canonical output ordering where possible.
3. No silent correction of ambiguous syntax without explicit diagnostics.

### Completion Requirements
1. Update `PLAN.md` Task 12.1 status.
2. Commit with Conventional Commit message.
3. Return changed files, tests, and blockers.
