# Repository Instructions

## Mission

Build and maintain a production-quality, server-based, Markdown-first Personal
Knowledge Management application with the everyday usability of Obsidian and
AI as a native, inspectable capability.

The current product definition, architecture, quality gates, and security
requirements live in `docs/`. Those documents are authoritative for details;
this file contains durable rules that apply to every agent and session.

## Read Before Acting

Before planning or changing code, read these files when they exist:

1. `docs/PRODUCT.md`
2. `docs/ARCHITECTURE.md`
3. `docs/QUALITY_BAR.md`
4. `docs/SECURITY.md`
5. `docs/DECISIONS.md`
6. `docs/WORKSTREAMS.md`
7. `docs/GAUNTLET_LOG.md`

When participating in a Gauntlet round, also read the repository's `/loop`
skill. Do not assume a builder's summary is evidence; inspect the actual files,
running application, tests, screenshots, traces, or measurements required by
your role.

If the documents disagree, do not silently pick one. Preserve safety, record
the conflict, and have the coordinating agent resolve it in `docs/DECISIONS.md`.

## Product Invariants

- Canonical user knowledge is normalized UTF-8 Markdown with YAML frontmatter.
- Preserve unknown YAML frontmatter keys and Markdown constructs during every
  read, edit, save, import, export, synchronization, and restoration round trip.
- ProseMirror state, Yjs state, database rows, search indexes, embeddings, and
  LightRAG data are projections. None replaces canonical Markdown.
- The user-curated hierarchy and the AI-derived semantic graph are distinct.
- LightRAG may extract entities, infer relationships, and suggest organization;
  it must not silently move, rewrite, delete, or reorganize canonical notes.
- Every AI-proposed canonical-content change requires a visible diff and
  explicit user approval.
- Grounded answers must cite exact source notes and clearly abstain when the
  available evidence is insufficient.
- Track the exact canonical document revision consumed by every derived index.
  Expose stale or failed indexing rather than presenting it as current.
- Enforce workspace isolation in storage, authorization, full-text search,
  vector retrieval, graph traversal, exports, backups, and AI processing.
- OKF compatibility is a versioned boundary. Implement Google Open Knowledge
  Format v0.2 without spreading version-specific assumptions through the domain.
- Standard Markdown links are the portable representation. Wikilinks are an
  ergonomic application extension with deterministic import/export behavior.

## Engineering Rules

- Follow the chosen stack and service boundaries in `docs/ARCHITECTURE.md`.
- Prefer the smallest architecture that meets measured requirements. Do not add
  infrastructure because it is fashionable or theoretically useful.
- Record consequential dependency, schema, architecture, security, privacy,
  and interoperability decisions in `docs/DECISIONS.md` with alternatives and
  evidence.
- Keep contracts explicit and versioned at service and persistence boundaries.
- Make migrations forward-safe, transactional where possible, and accompanied by
  a tested rollback or recovery procedure.
- Never weaken tests, authorization, validation, type safety, accessibility, or
  error handling to obtain a passing result.
- Do not hide unfinished behavior behind convincing visuals. Empty, loading,
  error, permission-denied, offline, reconnecting, conflict, and recovery states
  are part of the product.
- Treat errors as user-visible product behavior. Preserve actionable diagnostics
  without exposing secrets, private note content, or internal attack surface.
- Keep dependencies pinned through the repository lockfile. Investigate new
  packages for maintenance, license, security, and bundle-size impact.
- Use generated fixtures rather than real private notes in tests and demos.
- Do not log note bodies, prompts containing private notes, credentials, access
  tokens, embeddings, raw model responses, or attachment contents.

## Commands and Environment

- Use the package managers, runtime versions, and commands documented in the
  root `README.md` and committed environment configuration.
- After bootstrapping, the coordinator must update this section or the README
  with exact install, development, test, lint, type-check, build, migration,
  benchmark, and local-stack commands.
- Do not claim clean-checkout reproducibility until those commands have been run
  from a fresh environment.
- Prefer Docker Compose for the local production-like service stack. Do not
  deploy merely to verify local behavior.

## Change Discipline

- Inspect the existing implementation and repository state before editing.
- Establish a baseline for any behavior or metric that the change intends to
  improve.
- Add or update tests with every behavior change. When practical, observe the
  relevant test fail before the fix and pass after it.
- Keep changes scoped to the active workstream. Do not opportunistically rewrite
  unrelated code.
- Preserve user changes and unrelated work already present in the repository.
- Update relevant documentation in the same change as behavior, schema,
  architecture, setup, operational, or recovery modifications.
- Never claim that a test, screenshot, benchmark, comparison, audit, or manual
  workflow was performed unless it was actually performed against the artifact.

## Parallel Work and Ownership

- Parallelize aggressively only when work is genuinely independent.
- Before launching parallel builders, record exclusive file, directory, schema,
  or symbol ownership in `docs/WORKSTREAMS.md`.
- Two active builders must not modify overlapping ownership areas.
- The coordinating agent owns shared contracts, dependency manifests,
  lockfiles, common configuration, migrations, and final integration unless it
  explicitly delegates a non-overlapping change.
- Builders return runnable code, tests, and evidence. Their summaries are not
  acceptance decisions.
- Critics must use fresh context and inspect the real artifact. A critic must not
  accept the builder's claims without reproduction.
- Integrate accepted fronts one at a time, run the affected gates after each
  integration, and prioritize regressions before new improvements.

## Gauntlet Rules

- Use `/loop` for every material implementation front identified by the
  coordinating agent.
- There is no fixed attempt or round limit.
- Every important front receives a separate harsh critic with fresh context.
- Use blind A/B comparison when both our output and a named reference can be
  compared without revealing identity. Use deterministic standards, tests, and
  measurements when blind comparison is invalid.
- A vague score is not a verdict. Critics must identify pass/fail results or a
  binary winner and cite evidence.
- When our result loses, return the single largest meaningful gap to the builder,
  repair it, re-run regression checks, and submit it to a fresh critic.
- Critics may report that no material gap exists. Do not invent defects merely
  to continue a loop.
- Passing in isolation does not imply passing after integration.
- Maintain `docs/GAUNTLET_LOG.md` with rounds, evidence, verdicts, decisive gaps,
  resulting changes, regressions, and unresolved blockers.

## Verification Required Before Completion

A task is complete only when all applicable conditions hold:

- Relevant unit, integration, contract, end-to-end, accessibility, security,
  and performance tests pass.
- Formatting, linting, type checks, and production builds pass.
- The real running behavior has been inspected at the sizes and states required
  by `docs/QUALITY_BAR.md`.
- Canonical Markdown and OKF round-trip fixtures show no unintended semantic
  loss.
- Workspace-isolation tests show no cross-workspace leakage.
- Documentation describes the verified behavior and exact reproduction steps.
- The applicable fresh critic accepts the result using direct evidence.
- No unresolved release-blocking regression remains.

## Compute Authorization

- Compute cost and ACU consumption are not constraints for this project.
- Use as many managed Devin sessions, builders, critics, and Gauntlet rounds as
  are useful for quality.
- Monitor and terminate stuck, duplicative, conflicting, or non-improving work.
- Unlimited compute is not permission for uncontrolled scope expansion or
  unverifiable busywork.
- This authorization covers Devin compute for this project. It does not by
  itself authorize purchasing or provisioning third-party services.

## Permission Boundaries

Without explicit user approval, do not:

- Deploy or publish the application or artifacts.
- Purchase, upgrade, or provision third-party products or infrastructure.
- Create external accounts, projects, databases, buckets, domains, or model
  resources.
- Use credentials that are not already authorized for this repository and task.
- Contact people, send messages, open public announcements, or publish releases.
- Access, copy, modify, or delete production data.
- Perform an irreversible migration or destructive operation.
- Adopt a dependency or asset with material distribution, attribution, or
  commercial-use obligations that have not been reviewed.

## Safety and Privacy Boundaries

Stop and escalate before:

- Weakening authentication, authorization, tenant isolation, encryption, or
  validation to make development easier or tests pass.
- Sending private notes or attachments to a third-party model or service without
  explicit configuration, disclosure, and consent.
- Executing scripts, HTML, components, macros, or other active content imported
  from Markdown, attachments, or OKF bundles.
- Deleting user notes, attachments, workspace data, backups, or version history.
- Running a destructive migration without a verified backup and rollback path.
- Exposing private content through logs, analytics, telemetry, caches, URLs,
  browser storage, error reporting, search indexes, or cross-workspace retrieval.

Escalate questions that require human product judgment, including branding,
default model providers, external AI data policy, retention policy, licensing
conflicts, material changes to v1 scope, and tradeoffs that change user trust.
