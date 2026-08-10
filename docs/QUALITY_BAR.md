# PKM v1 Quality Bar

## Named References

1. **Obsidian** (stable desktop application) — note creation, wikilinks,
   backlinks, properties, command palette, search, outline, graph.
2. **Outline** (stable server application) — polished server-based navigation,
   responsive workspace UX, admin states.
3. **Google OKF v0.2** — <https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md>
4. **LightRAG repository and documentation** — <https://github.com/Systran-FinQuery/LightRAG>
5. **WCAG 2.2 AA** — <https://www.w3.org/WAI/WCAG22/Understanding/>
6. **OWASP ASVS Level 2** — <https://github.com/OWASP/ASVS>

Captured versions, URLs, dates, and test conditions are recorded when each
reference is inspected.

## Metrics and Budgets

- Full-text search p95 < 150 ms on 10,000 generated notes.
- Note open time < 200 ms for notes up to 100,000 words.
- Keystroke latency in source editor < 16 ms for 95th percentile.
- Initial page load (desktop) < 2 s on a broadband connection.
- Mobile first contentful paint < 1.5 s.
- Accessibility: zero serious or critical axe violations on primary journeys.

## Comparison Protocol

- For directly comparable UI workflows, randomize labels and conduct blind
  A/B comparisons against Obsidian/Outline.
- Verdict is binary: candidate wins, reference wins, or comparison invalid.
- For security, accessibility, correctness, retrieval, and resilience, use
  deterministic tests and measurements.

## Pass/Fail Rules

- Candidate must win or tie every valid material blind comparison.
- All deterministic acceptance gates in `PRODUCT.md` must pass.
- No unresolved release-blocking regression may remain.
