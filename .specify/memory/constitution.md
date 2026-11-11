<!--
SYNC IMPACT REPORT
==================
Version change: (none) → 1.0.0
Bump rationale: Initial ratification of the project constitution.

Principles defined:
  I.    Code Quality (NON-NEGOTIABLE)
  II.   Test-Driven Development (NON-NEGOTIABLE)
  III.  Reuse First — Shared Components & Functions
  IV.   Centralized Business Logic
  V.    User Experience Consistency
  VI.   Performance Requirements
  VII.  Commit Discipline
  VIII. Skill-Assisted Development

Sections added: Core Principles, Quality Gates, Development Workflow, Governance

Templates requiring updates:
  ⚠ .specify/templates/plan-template.md      — not yet present; its "Constitution Check" must list gates I–VIII
  ⚠ .specify/templates/spec-template.md      — not yet present; must capture UX + performance acceptance criteria
  ⚠ .specify/templates/tasks-template.md     — not yet present; test tasks MUST precede implementation tasks
  ⚠ .specify/templates/checklist-template.md — not yet present
  ⚠ .claude/commands/speckit.*.md            — not yet present (Spec Kit not initialized)

Follow-up TODOs:
  - Initialize Spec Kit (`specify init --here --ai claude --script ps`) and re-run
    /speckit.constitution to propagate these principles into the templates.
  - Tighten performance budgets in Principle VI once the tech stack is chosen in /speckit.plan.
-->

# BGS Monitor Constitution

## Core Principles

### I. Code Quality (NON-NEGOTIABLE)

- Code MUST be readable first: clear names, small functions (one job each), no dead code, and no commented-out blocks.
- Linting, formatting, and type checking (strict mode where the language supports it) MUST pass with zero errors before any commit. Warnings MUST NOT be suppressed without an inline justification.
- Every function, module, and component MUST have a single, clear responsibility. Files that grow beyond one responsibility MUST be split.
- Errors MUST be handled explicitly. Silent `catch` blocks, swallowed promises, and fallbacks that hide failures are forbidden. Every failure is either surfaced to the user in a meaningful way or logged with context.
- No magic numbers or strings: constants, configuration, and enums live in one named place.
- Every change MUST be reviewed with the `code-review` skill (or by a human reviewer) before it is merged or the task is marked done.

**Rationale**: BGS Monitor serves a hospital environment. Unclear or fragile code becomes an operational risk, so quality is enforced up front instead of repaired later.

### II. Test-Driven Development (NON-NEGOTIABLE)

- Red → Green → Refactor is mandatory. A failing test MUST be written and seen to fail **before** the implementation code is written.
- Test layers:
  - **Unit tests**: every business rule and shared utility in the centralized logic layer (Principle IV) MUST be fully covered.
  - **Integration tests**: every API endpoint, data-access path, and external integration.
  - **End-to-end (E2E) tests**: every primary user journey defined in a spec, automated with Playwright.
- Coverage MUST be at least **90%** for business logic modules and at least **80%** overall. Coverage is a floor, not a goal; meaningful assertions matter more than percentages.
- Every bug fix MUST start with a test that reproduces the bug.
- Tests MUST be deterministic, independent, and fast. Flaky tests are treated as bugs and fixed immediately, never skipped or retried to make them pass.
- A task MUST NOT be marked complete until the full test suite passes and the passing output has been seen (evidence before claims).

**Rationale**: Tests written first define correct behavior before code exists. That prevents regressions in a system people rely on for monitoring.

### III. Reuse First — Shared Components & Functions

- Before writing new code, existing components, hooks, utilities, and services MUST be searched for and reused or extended.
- Any UI pattern used, or likely to be used, in **two or more places** MUST become a shared component. Any logic repeated twice MUST be extracted into a shared function.
- Shared code lives in clearly named, discoverable locations (for example `components/ui`, `lib/`, `utils/`, `hooks/`). The exact paths are defined in the implementation plan.
- Shared components MUST be generic and configurable through props or parameters. They MUST NOT be coupled to a single feature's data shape.
- Each shared unit MUST have its own tests and a short usage note (a doc comment or story).

**Rationale**: Duplicated code drifts apart, multiplies bugs, and breaks UX consistency. Reuse keeps the codebase small and behavior predictable.

### IV. Centralized Business Logic

- All business rules (calculations, validation, status and threshold evaluation, permissions, and workflow transitions) MUST live in a dedicated domain/service layer. They MUST NOT live in UI components, route handlers, or database queries.
- UI components are presentation only: they render state and dispatch actions. API and route handlers are thin: they parse input, call domain services, and format output.
- Each business rule has exactly **one** source of truth. Validation schemas MUST be shared between client and server where the stack allows it.
- The domain layer MUST be pure where possible (no direct I/O). Dependencies such as database access, clocks, and external APIs are injected so the layer can be unit tested in isolation.

**Rationale**: When rules are scattered, changing one rule means hunting through the whole app. Centralizing them makes rules auditable, testable, and safe to change.

### V. User Experience Consistency

- All UI MUST use a single design system: shared design tokens (color, spacing, typography, radius, and shadow) and the shared component library from Principle III. One-off inline styles and ad-hoc colors are forbidden.
- Interaction patterns MUST be consistent across the app: the same action looks and behaves the same way everywhere (buttons, forms, tables, modals, notifications, and confirmations).
- Every data-driven view MUST define its **loading, empty, error, and success** states explicitly.
- Accessibility: the app MUST meet **WCAG 2.1 AA** (keyboard navigation, visible focus, sufficient contrast, labels for all inputs, and no information conveyed by color alone).
- Layouts MUST be responsive and usable on the target devices defined in the spec.
- User-facing messages MUST be clear, actionable, and consistent in tone and language. Raw technical errors MUST NOT be shown to users.
- New UI work MUST use the `frontend-design` skill to set a deliberate visual direction within the design system.

**Rationale**: In a monitoring context, users must read status quickly and act correctly. Inconsistency causes hesitation and errors.

### VI. Performance Requirements

Default budgets apply unless a feature's plan defines stricter ones:

- **Web vitals** (p75, on the target device and network): LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
- **API latency**: p95 ≤ 300 ms for reads and ≤ 500 ms for writes, measured at the server.
- **Real-time / monitoring data**: updates MUST reach the UI within 2 s of the source event, where the feature requires live data.
- **Data handling**: lists that can grow without bound MUST be paginated or virtualized. Queries MUST be indexed. N+1 query patterns are forbidden.
- **Payload**: the initial JS bundle for any route SHOULD stay under 200 KB gzipped. Heavy dependencies require justification in the plan.
- Performance-critical paths MUST have automated measurements or benchmarks. A regression beyond its budget blocks the merge.

**Rationale**: Slow monitoring tools get ignored or worked around. Budgets make performance a requirement, not an afterthought.

### VII. Commit Discipline

- Commit **early and often**: after every green test cycle and every completed task, the work MUST be committed. Large uncommitted changes are forbidden.
- Each commit MUST be atomic (one logical change) and leave the codebase in a passing state: lint, type check, and tests all green.
- Commit messages follow **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`) and explain *why*, not only *what*.
- Feature work happens on a feature branch (`###-feature-name`, created by the Spec Kit scripts). The default branch MUST stay releasable.
- Never commit secrets, credentials, `.env` files, or patient or personal data. Pre-commit hooks MUST NOT be bypassed (`--no-verify` is forbidden).

**Rationale**: Frequent, small, verified commits make every mistake easy to find and cheap to undo.

### VIII. Skill-Assisted Development

The available Claude Code skills and tools MUST be used at the matching stage of work:

| Stage | Required skill / tool |
|---|---|
| Ideation, new features | `superpowers:brainstorming` → `/speckit.specify` → `/speckit.clarify` |
| Planning | `/speckit.plan`, `superpowers:writing-plans` |
| Task breakdown | `/speckit.tasks`, `/speckit.analyze` |
| Implementation | `/speckit.implement`, `superpowers:test-driven-development` |
| UI work | `frontend-design` |
| Bugs, test failures | `superpowers:systematic-debugging` (find the root cause before fixing) |
| E2E / browser verification | Playwright MCP |
| Review before merge | `code-review`, `superpowers:requesting-code-review` |
| Before claiming "done" | `superpowers:verification-before-completion` |
| Long autonomous task runs | Ralph Loop, only with a clear completion criterion and passing tests as the exit condition |

- When a skill exists for the task at hand, it MUST be used rather than improvised.
- Library and framework APIs MUST be checked against current documentation (for example via Context7), not written from memory.

**Rationale**: The skills encode proven workflows. Using them consistently gives repeatable quality regardless of who or what is writing the code.

## Quality Gates

A change is **done** only when all of the following are true:

1. A spec exists, and the plan passes the Constitution Check against Principles I–VIII.
2. Tests were written first and now pass. Coverage thresholds are met.
3. Lint, format, and type check pass with zero errors.
4. No duplicated logic was introduced. Shared components and functions were reused or created.
5. Business logic lives only in the domain layer.
6. UI follows the design system, includes all four view states, and meets WCAG 2.1 AA.
7. Performance budgets are verified for the affected paths.
8. Code review is complete and its findings are resolved.
9. The work is committed with a Conventional Commit message.

## Development Workflow

1. **Specify**: `/speckit.specify` defines *what* and *why*. `/speckit.clarify` resolves ambiguity.
2. **Plan**: `/speckit.plan` chooses the stack and architecture and runs the Constitution Check. Any violation MUST be justified in the plan's Complexity Tracking table or removed.
3. **Tasks**: `/speckit.tasks` produces ordered tasks with test tasks before implementation tasks. `/speckit.analyze` checks consistency.
4. **Implement**: `/speckit.implement` follows a red → green → refactor → commit loop for each task.
5. **Verify & Review**: run the full test suite and Playwright E2E tests, then use the `code-review` skill, fix findings, and commit.

## Governance

- This constitution supersedes all other practices, conventions, and preferences in this repository. Where guidance conflicts, the constitution wins.
- **Amendments** require a written rationale, an update to this file, a version bump, and propagation to the dependent templates (`plan`, `spec`, `tasks`, `checklist`) and agent guidance files in the same commit.
- **Versioning** follows semantic versioning:
  - **MAJOR**: a principle is removed or redefined in a backward-incompatible way.
  - **MINOR**: a principle or section is added or materially expanded.
  - **PATCH**: clarifications and wording fixes with no change in meaning.
- **Compliance**: every plan and every review MUST check conformance with this constitution. Unjustified complexity or violations block the merge.
- Runtime development guidance for agents lives in `CLAUDE.md` and MUST stay consistent with this document.

**Version**: 1.0.0 | **Ratified**: 2026-11-11 | **Last Amended**: 2026-11-11
