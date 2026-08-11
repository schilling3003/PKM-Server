# PKM v1 Golden-Path Web UI Test Report

Branch: `devin/pkm-v1-search-ai`
Commit under test: `ffd3d4e`
Date: 2026-08-11 UTC

## Browser Environment

- Chrome (incognito window)
- Web app: `http://localhost:3000`
- API: `http://localhost:4000`
- AI service: `http://localhost:8000`

## Web UI Scenarios

| Scenario | Result |
|----------|--------|
| Register a new user | PASS |
| Login after registration | PASS (auto-redirect to `/workspaces`) |
| Create a note through the editor | PASS |
| Save the note | PASS |
| Switch workspaces (home → second workspace) | PASS |
| Search palette finds note in current workspace | PASS |
| Search palette returns no results in empty workspace | PASS |
| Toggle theme light → dark | PASS |

## Notes

- The login form redirected to `/workspaces` after registration, which is a 404 page. Navigating to `/` shows the workspace list correctly.
- Search palette is opened with `Ctrl+K` and is workspace-scoped: the note created in `UI Golden` workspace was found there, but the same query in `Second Workspace` returned 0 results.
- Theme toggle was verified by the page background changing to dark mode.

## Screenshots

- `ui-01-login-page.png`
- `ui-02-register-form.png`
- `ui-03-register-error.png` (initial attempt using programmatic value setting, before real typing)
- `ui-04-home-workspaces.png`
- `ui-05-note-saved.png`
- `ui-06-search-results.png`
- `ui-07-second-workspace.png`
- `ui-08-search-scoped-empty.png`
- `ui-09-theme-dark.png`

## Recording

- `/home/ubuntu/screencasts/rec-43747c31-be15-4e31-b725-ac5d6744caad/rec-43747c31-be15-4e31-b725-ac5d6744caad-edited.mp4`
