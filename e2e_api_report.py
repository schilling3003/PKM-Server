#!/usr/bin/env python3
"""End-to-end API scenario runner for PKM v1 walking skeleton."""
import json
import re
import sys
import time
import uuid
from pathlib import Path

import requests

BASE = "http://127.0.0.1:4000"
AI_BASE = "http://127.0.0.1:8000"


def fail(msg):
    print(f"FAIL: {msg}")
    return False


def ok(msg):
    print(f"PASS: {msg}")
    return True


class ScenarioRunner:
    def __init__(self):
        self.results = []
        self.user1 = requests.Session()
        self.user2 = requests.Session()
        self.email1 = f"u1-{uuid.uuid4().hex[:8]}@example.com"
        self.email2 = f"u2-{uuid.uuid4().hex[:8]}@example.com"
        self.password = "Password123!"
        self.ws1 = None
        self.ws2 = None
        self.note_id = None

    def run(self):
        all_pass = True
        all_pass &= self.scenario_auth()
        all_pass &= self.scenario_workspaces()
        all_pass &= self.scenario_isolation()
        all_pass &= self.scenario_documents()
        all_pass &= self.scenario_search()
        all_pass &= self.scenario_ask()
        all_pass &= self.scenario_okf()
        all_pass &= self.scenario_attachments()
        return all_pass

    def scenario_auth(self):
        print("\n--- Auth ---")
        r = self.user1.post(f"{BASE}/auth/register", json={"email": self.email1, "password": self.password})
        if r.status_code != 201:
            return fail(f"register status {r.status_code}: {r.text}")
        body = r.json()
        if body["user"]["email"] != self.email1 or "password_hash" in body["user"]:
            return fail(f"register response malformed: {body}")
        ok("register returns user without password_hash")

        r = self.user1.get(f"{BASE}/auth/me")
        if r.status_code != 200 or r.json()["user"]["email"] != self.email1:
            return fail(f"/auth/me after register: {r.status_code} {r.text}")
        ok("/auth/me returns current user")

        # logout
        r = self.user1.post(f"{BASE}/auth/logout")
        if r.status_code != 200:
            return fail(f"logout status {r.status_code}: {r.text}")
        ok("logout succeeds")

        r = self.user1.get(f"{BASE}/auth/me")
        if r.status_code != 401:
            return fail(f"/auth/me after logout should be 401, got {r.status_code}")
        ok("/auth/me returns 401 after logout")

        # login
        r = self.user1.post(f"{BASE}/auth/login", json={"email": self.email1, "password": self.password})
        if r.status_code != 200 or r.json()["user"]["email"] != self.email1:
            return fail(f"login failed: {r.status_code} {r.text}")
        ok("login succeeds")

        r = self.user1.get(f"{BASE}/auth/me")
        if r.status_code != 200 or r.json()["user"]["email"] != self.email1:
            return fail(f"/auth/me after login failed: {r.status_code} {r.text}")
        ok("/auth/me succeeds after login")
        return True

    def scenario_workspaces(self):
        print("\n--- Workspaces ---")
        r = self.user1.post(f"{BASE}/workspaces", json={"name": "Alpha Workspace"})
        if r.status_code != 201:
            return fail(f"create workspace status {r.status_code}: {r.text}")
        self.ws1 = r.json()
        ok("create workspace")

        r = self.user1.get(f"{BASE}/workspaces")
        if r.status_code != 200:
            return fail(f"list workspaces status {r.status_code}: {r.text}")
        ws_list = r.json()
        ids = [w["id"] for w in ws_list]
        if self.ws1["id"] not in ids:
            return fail(f"created workspace not in list: {ws_list}")
        ok("/workspaces lists member workspaces only")
        return True

    def scenario_isolation(self):
        print("\n--- Workspace Isolation ---")
        r = self.user2.post(f"{BASE}/auth/register", json={"email": self.email2, "password": self.password})
        if r.status_code != 201:
            return fail(f"register user2 status {r.status_code}: {r.text}")
        r = self.user2.post(f"{BASE}/workspaces", json={"name": "Beta Workspace"})
        if r.status_code != 201:
            return fail(f"create workspace2 status {r.status_code}: {r.text}")
        self.ws2 = r.json()
        ok("user2 creates own workspace")

        # user1 tries user2's workspace documents and search
        r = self.user1.get(f"{BASE}/workspaces/{self.ws2['id']}/documents")
        if r.status_code != 403:
            return fail(f"non-member documents should be 403, got {r.status_code}: {r.text}")
        ok("non-member documents returns 403")

        r = self.user1.get(f"{BASE}/workspaces/{self.ws2['id']}/search?q=hello")
        if r.status_code != 403:
            return fail(f"non-member search should be 403, got {r.status_code}: {r.text}")
        ok("non-member search returns 403")
        return True

    def scenario_documents(self):
        print("\n--- Documents ---")
        # create target note
        r = self.user1.post(
            f"{BASE}/workspaces/{self.ws1['id']}/documents",
            json={"path": "b.md", "content": "---\ntype: Note\n---\n\nBody of B.\n"},
        )
        if r.status_code != 201:
            return fail(f"create b.md status {r.status_code}: {r.text}")
        b = r.json()
        ok("create note b.md")

        # create source note linking to b.md
        r = self.user1.post(
            f"{BASE}/workspaces/{self.ws1['id']}/documents",
            json={"path": "a.md", "content": "---\ntype: Note\n---\n\nSee [B](b.md).\n"},
        )
        if r.status_code != 201:
            return fail(f"create a.md status {r.status_code}: {r.text}")
        a = r.json()
        ok("create note a.md with link to b.md")

        # outgoing links from a
        r = self.user1.get(f"{BASE}/workspaces/{self.ws1['id']}/documents/{a['id']}/links")
        if r.status_code != 200:
            return fail(f"outgoing links status {r.status_code}: {r.text}")
        links = r.json()
        if not any(l["path"] == "b.md" for l in links):
            return fail(f"outgoing links missing b.md: {links}")
        ok("outgoing links show b.md")

        # backlinks to b
        r = self.user1.get(f"{BASE}/workspaces/{self.ws1['id']}/documents/{b['id']}/backlinks")
        if r.status_code != 200:
            return fail(f"backlinks status {r.status_code}: {r.text}")
        bls = r.json()
        if not any(l["path"] == "a.md" for l in bls):
            return fail(f"backlinks missing a.md: {bls}")
        ok("backlinks show a.md")

        # edit and save a
        r = self.user1.put(
            f"{BASE}/workspaces/{self.ws1['id']}/documents/{a['id']}",
            json={"content": "---\ntype: Note\n---\n\nUpdated link to [B](b.md).\n"},
        )
        if r.status_code != 200:
            return fail(f"update a.md status {r.status_code}: {r.text}")
        ok("edit and save a.md")

        # rename b to c
        r = self.user1.put(
            f"{BASE}/workspaces/{self.ws1['id']}/documents/{b['id']}",
            json={"path": "c.md"},
        )
        if r.status_code != 200 or r.json()["path"] != "c.md":
            return fail(f"rename b->c failed: {r.status_code} {r.text}")
        ok("rename b.md to c.md")

        # outgoing links from a should now point to c.md
        r = self.user1.get(f"{BASE}/workspaces/{self.ws1['id']}/documents/{a['id']}/links")
        links = r.json()
        if not any(l["path"] == "c.md" for l in links):
            return fail(f"outgoing links not updated to c.md: {links}")
        ok("outgoing links updated after rename")

        # backlinks to c should show a.md
        r = self.user1.get(f"{BASE}/workspaces/{self.ws1['id']}/documents/{b['id']}/backlinks")
        bls = r.json()
        if not any(l["path"] == "a.md" for l in bls):
            return fail(f"backlinks to renamed doc missing a.md: {bls}")
        ok("backlinks updated after rename")

        # delete c
        r = self.user1.delete(f"{BASE}/workspaces/{self.ws1['id']}/documents/{b['id']}")
        if r.status_code != 204:
            return fail(f"delete c status {r.status_code}: {r.text}")
        ok("delete c.md")

        r = self.user1.get(f"{BASE}/workspaces/{self.ws1['id']}/documents/{b['id']}")
        if r.status_code != 404:
            return fail(f"deleted doc should be 404, got {r.status_code}")
        ok("deleted document no longer retrievable")

        # clean up a
        self.user1.delete(f"{BASE}/workspaces/{self.ws1['id']}/documents/{a['id']}")
        return True

    def scenario_search(self):
        print("\n--- Search ---")
        unique = f"xyzzy-{uuid.uuid4().hex[:8]}"
        r = self.user1.post(
            f"{BASE}/workspaces/{self.ws1['id']}/documents",
            json={"path": "search-note.md", "content": f"---\ntype: Note\n---\n\n{unique} content here.\n"},
        )
        if r.status_code != 201:
            return fail(f"create search note status {r.status_code}: {r.text}")
        note = r.json()

        # allow indexing a moment
        time.sleep(0.5)

        r = self.user1.get(f"{BASE}/workspaces/{self.ws1['id']}/search?q={unique}")
        if r.status_code != 200:
            return fail(f"search status {r.status_code}: {r.text}")
        results = r.json()
        if not any(unique in res.get("content", "") for res in results):
            return fail(f"search did not find unique text: {results}")
        ok("search finds note in workspace")

        # workspace-scoped: same query in ws2 should yield nothing
        r = self.user2.get(f"{BASE}/workspaces/{self.ws2['id']}/search?q={unique}")
        if r.status_code != 200:
            return fail(f"search in ws2 status {r.status_code}: {r.text}")
        if r.json():
            return fail(f"search leaked into ws2: {r.json()}")
        ok("search results are workspace-scoped")

        # invalid limit
        r = self.user1.get(f"{BASE}/workspaces/{self.ws1['id']}/search?q={unique}&limit=abc")
        if r.status_code != 400:
            return fail(f"invalid limit should be 400, got {r.status_code}: {r.text}")
        ok("invalid limit=abc returns 400")

        # cleanup
        self.user1.delete(f"{BASE}/workspaces/{self.ws1['id']}/documents/{note['id']}")
        return True

    def scenario_ask(self):
        print("\n--- Ask ---")
        r = self.user1.post(
            f"{BASE}/workspaces/{self.ws1['id']}/documents",
            json={"path": "mars.md", "content": "---\ntype: Note\n---\n\nThe capital city of Mars is Olympus.\n"},
        )
        if r.status_code != 201:
            return fail(f"create ask note status {r.status_code}: {r.text}")

        # ask question whose answer is in workspace
        r = self.user1.post(
            f"{BASE}/workspaces/{self.ws1['id']}/ask",
            json={"question": "What is the capital city of Mars?"},
        )
        if r.status_code != 200:
            return fail(f"ask status {r.status_code}: {r.text}")
        answer = r.json()
        citations = answer.get("citations", [])
        if not citations:
            return fail(f"ask returned no citations: {answer}")
        if not any("mars.md" in c.get("path", "") for c in citations):
            return fail(f"citations do not include mars.md: {citations}")
        ok("ask cites a source from the same workspace")
        return True

    def scenario_okf(self):
        print("\n--- OKF ---")
        r = self.user1.post(f"{BASE}/workspaces", json={"name": "OKF Test"})
        if r.status_code != 201:
            return fail(f"create okf workspace status {r.status_code}: {r.text}")
        ws = r.json()

        bundle = {
            "version": "0.2",
            "workspace": ws["name"],
            "concepts": [
                {
                    "path": "note.md",
                    "metadata": {"type": "Note", "title": "Concept Note"},
                    "document": {"body": "# Hello\n\nThis is a concept.\n"},
                }
            ],
            "indices": [{"path": "index.md", "content": "---\ntype: Index\n---\n\nIndex content.\n"}],
            "logs": [{"path": "log.md", "content": "---\ntype: Log\n---\n\nLog content.\n"}],
        }

        r = self.user1.post(f"{BASE}/workspaces/{ws['id']}/okf/import", json=bundle)
        if r.status_code != 200:
            return fail(f"OKF import status {r.status_code}: {r.text}")
        imported = r.json()
        if imported.get("imported") != 3:
            return fail(f"expected 3 imported, got {imported}")
        ok("import bundle with note.md, index.md, log.md")

        # capture canonical content after first import
        r = self.user1.get(f"{BASE}/workspaces/{ws['id']}/documents")
        docs_after_import = r.json()
        paths = {d["path"]: d for d in docs_after_import}
        if set(paths.keys()) != {"note.md", "index.md", "log.md"}:
            return fail(f"unexpected docs after import: {paths.keys()}")
        ok("import created note.md, index.md, and log.md")

        # export
        r = self.user1.get(f"{BASE}/workspaces/{ws['id']}/okf/export")
        if r.status_code != 200:
            return fail(f"OKF export status {r.status_code}: {r.text}")
        exported = r.json()
        if exported.get("version") != "0.2" or exported.get("workspace") != ws["name"]:
            return fail(f"export metadata wrong: {exported}")
        ok("export workspace")

        # re-import exported bundle
        r = self.user1.post(f"{BASE}/workspaces/{ws['id']}/okf/import", json=exported)
        if r.status_code != 200:
            return fail(f"OKF re-import status {r.status_code}: {r.text}")

        r = self.user1.get(f"{BASE}/workspaces/{ws['id']}/documents")
        docs_after_reimport = r.json()
        if len(docs_after_reimport) != 3:
            return fail(f"re-import changed doc count: {docs_after_reimport}")

        # compare note.md content
        after_map = {d["path"]: d for d in docs_after_reimport}
        for p in ["note.md", "index.md", "log.md"]:
            if after_map.get(p, {}).get("content") != paths[p]["content"]:
                return fail(f"data loss on re-import for {p}: {after_map.get(p)} vs {paths[p]}")
        ok("re-import round-trip preserves content")

        # regular document API rejects reserved filenames
        for reserved in ["index.md", "log.md"]:
            r = self.user1.post(
                f"{BASE}/workspaces/{ws['id']}/documents",
                json={"path": reserved, "content": "---\ntype: Note\n---\n\nbody\n"},
            )
            if r.status_code != 400:
                return fail(f"regular API should reject {reserved} with 400, got {r.status_code}: {r.text}")
        ok("regular document API rejects index.md and log.md with 400")
        return True

    def scenario_attachments(self):
        print("\n--- Attachments ---")
        r = self.user1.post(f"{BASE}/workspaces", json={"name": "Attachments Test"})
        if r.status_code != 201:
            return fail(f"create attachments workspace status {r.status_code}: {r.text}")
        ws = r.json()

        # upload
        content = b"Hello attachment world!"
        r = self.user1.post(
            f"{BASE}/workspaces/{ws['id']}/attachments",
            files={"file": ("hello.txt", content, "text/plain")},
        )
        if r.status_code != 201:
            return fail(f"upload attachment status {r.status_code}: {r.text}")
        att = r.json()
        if att.get("filename") != "hello.txt" or att.get("size_bytes") != len(content):
            return fail(f"attachment metadata wrong: {att}")
        ok("upload file to workspace")

        # list
        r = self.user1.get(f"{BASE}/workspaces/{ws['id']}/attachments")
        if r.status_code != 200:
            return fail(f"list attachments status {r.status_code}: {r.text}")
        atts = r.json()
        if att["id"] not in [a["id"] for a in atts]:
            return fail(f"uploaded attachment not in list: {atts}")
        ok("list attachments")

        # download
        r = self.user1.get(
            f"{BASE}/attachments/{att['id']}?workspaceId={ws['id']}",
            allow_redirects=False,
        )
        if r.status_code != 302:
            return fail(f"download should redirect 302, got {r.status_code}: {r.text}")
        location = r.headers.get("location", "")
        if "9000" not in location or att["storage_key"] not in location:
            return fail(f"download redirect missing minio URL/storage key: {location}")
        ok("download redirects to presigned MinIO URL")

        # non-member cannot download
        r = self.user2.get(
            f"{BASE}/attachments/{att['id']}?workspaceId={ws['id']}",
            allow_redirects=False,
        )
        if r.status_code != 403:
            return fail(f"non-member download should be 403, got {r.status_code}: {r.text}")
        ok("non-member cannot download attachment")

        # delete
        r = self.user1.delete(f"{BASE}/attachments/{att['id']}?workspaceId={ws['id']}")
        if r.status_code != 204:
            return fail(f"delete attachment status {r.status_code}: {r.text}")
        ok("delete attachment")
        return True


if __name__ == "__main__":
    runner = ScenarioRunner()
    success = runner.run()
    print("\n" + ("ALL API SCENARIOS PASSED" if success else "SOME API SCENARIOS FAILED"))
    sys.exit(0 if success else 1)
