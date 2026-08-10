# PKM v1 Product Definition

## Mission

A production-quality, server-based, Markdown-first Personal Knowledge Management
application. Everyday usability should approach Obsidian, with AI as a native,
inspectable capability.

## Personas

- **Knowledge worker**: writes, links, and retrieves notes daily using keyboard
  and mobile workflows.
- **Team member**: collaborates on shared workspaces with presence and conflict
  resolution.
- **Admin/operator**: deploys, monitors, backs up, and restores the service.

## v1 Scope

1. Create, edit, autosave, rename, move, duplicate, archive, restore, and delete
   Markdown notes.
2. Navigate folders and a user-curated knowledge tree.
3. Create standard Markdown links and `[[wikilinks]]` with fast autocomplete.
4. View backlinks, unlinked mentions, tags, YAML properties, a note outline, and
   a graph of relationships.
5. Find notes quickly with full-text, property, and semantic search.
6. Import and export a complete, portable knowledge base without semantic loss.
7. Ask grounded questions across notes and receive citations to exact source
   notes and relevant passages.
8. Inspect and approve AI-proposed edits through a clear diff before canonical
   Markdown changes.
9. Access the application securely from desktop and mobile browsers.
10. Recover previous document versions and survive disconnects, reconnects,
    concurrent edits, process restarts, and failed indexing.
11. See whether AI indexes are current, stale, processing, or failed.
12. Use the core product effectively through the keyboard without reading
   documentation.

## OKF v0.2

Implement Google Open Knowledge Format version 0.2 as a versioned compatibility
adapter. Preserve unknown YAML frontmatter, require a valid `type` for OKF
concept documents, respect `index.md` and `log.md` semantics, and support
provenance, sources, actors, status, staleness, and attested-computation
constructs.

## Acceptance Criteria

- All primary user journeys have automated end-to-end tests and documented
  manual inspection.
- Core note creation, linking, navigation, search, and command workflows are
  keyboard operable.
- Autosave, restart, reconnect, conflict, and recovery tests demonstrate no
  silent data loss.
- 100,000-word notes and 10,000-note generated workspaces remain usable within
  the budgets in `QUALITY_BAR.md`.
- Source and visual modes preserve supported Markdown and unknown YAML fields.
- OKF fixtures validate, round-trip, and preserve producer-defined fields.
- Workspace isolation tests show zero cross-workspace leakage through any API,
  search, graph, or AI path.
- Axe reports no serious or critical violations on primary workflows.

## Non-goals

- Native desktop or mobile applications (web/PWA only).
- Public marketplace or plugin ecosystem.
- Real-time voice or video collaboration.
- Multi-region active-active deployment.
- Federated or blockchain identity.
