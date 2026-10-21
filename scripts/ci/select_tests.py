#!/usr/bin/env python3
"""Conservative suite selection. Any uncertainty means full application CI.

No GitHub API/path-list truncation, package imports, or network requests. PR tests
still run the checkout action's merge commit, not an unmerged branch snapshot.
"""

import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import sys


SUITES = ("backend", "frontend", "mobile", "playwright")
SHA = re.compile(r"[0-9a-f]{40}\Z")
# Only this deliberately small landing scope gets a reduced E2E selection.
LANDING = {"frontend/src/pages/Home.jsx", "frontend/e2e/home.spec.ts"}
SMOKE_SPECS = (
    "e2e/home.spec.ts", "e2e/public.spec.ts", "e2e/master.spec.ts",
    "e2e/client.spec.ts", "e2e/public-booking.spec.ts",
)


def full(reason):
    return {**{suite: True for suite in SUITES}, "full": True, "docs_only": False,
            "playwright_mode": "full", "reason": reason}


def knowledge_docs(reason="knowledge-docs"):
    """Knowledge/ markdown is living project docs, not application runtime.

    MkDocs builds `docs/`. Docker/frontend/mobile copy paths do not include
    Knowledge/. A zero-suite result is allowed only for this explicit class.
    """
    return {**{suite: False for suite in SUITES}, "full": False, "docs_only": True,
            "playwright_mode": "none", "reason": reason}


def is_knowledge_markdown(path):
    posix = PurePosixPath(path)
    return path.startswith("Knowledge/") and posix.suffix == ".md"


def classify(paths):
    paths = set(paths)
    if not paths:
        return full("empty-diff")
    docs = {path for path in paths if is_knowledge_markdown(path)}
    app_paths = paths - docs
    if not app_paths:
        return knowledge_docs()
    chosen = {suite: False for suite in SUITES}
    for path in app_paths:
        parts = PurePosixPath(path).parts
        if not parts or path.startswith("/") or ".." in parts or "\\" in path:
            return full("unrecognized-path")
        if PurePosixPath(path).suffix in {".yml", ".yaml", ".toml", ".ini", ".cfg"}:
            return full("configuration")
        # Config/tooling/lockfiles are deliberately NOT covered by broad package
        # prefixes. New or unclassified paths default to full.
        if path.startswith(("shared/", ".github/", "scripts/")):
            return full("shared-or-ci-tooling")
        if path.startswith("backend/tests/"):
            if path.endswith("conftest.py"):
                return full("test-configuration")
            chosen["backend"] = chosen["playwright"] = True
        elif path.startswith("backend/"):
            # Includes migrations, models, auth, payments, booking guards and API
            # contracts. Cross-client effects cannot safely be inferred by name.
            return full("backend-runtime-or-configuration")
        elif path.startswith(("frontend/src/", "frontend/public/", "frontend/e2e/")):
            if path.startswith(("frontend/src/utils/", "frontend/src/services/",
                                "frontend/src/contexts/", "frontend/src/config/")):
                return full("frontend-contract-or-shared-helper")
            if path.startswith("frontend/e2e/") and not path.endswith(".spec.ts"):
                return full("e2e-configuration-or-fixtures")
            chosen["frontend"] = chosen["playwright"] = True
        elif path.startswith(("mobile/src/", "mobile/app/", "mobile/assets/",
                              "mobile/__tests__/", "mobile/modules/",
                              "mobile/ios/", "mobile/android/")):
            if path.startswith(("mobile/src/services/api/", "mobile/src/config/",
                                "mobile/src/types/")):
                return full("mobile-api-or-product-contract")
            chosen["mobile"] = True
        else:
            return full("unknown-or-configuration-path")
    landing = app_paths <= LANDING
    return {**chosen, "full": False, "docs_only": False,
            "playwright_mode": "smoke" if landing else "full",
            "reason": "landing-only" if landing else "known-package-scope"}


def git(repo, *args):
    return subprocess.run(
        ["git", "-C", str(repo), *args], check=True, stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, timeout=30,
    ).stdout


def commit(repo, sha):
    if not isinstance(sha, str) or not SHA.fullmatch(sha) or sha == "0" * 40:
        raise ValueError("invalid/missing SHA")
    git(repo, "cat-file", "-e", sha + "^{commit}")
    return sha


def changed(repo, base, head):
    # Disable rename detection so BOTH old and new paths affect the decision.
    raw = git(repo, "diff", "--name-only", "--no-renames", "-z", base, head, "--")
    return {p.decode("utf-8", errors="strict") for p in raw.split(b"\0") if p}


def smoke_specs_or_error(repo):
    """Return SMOKE_SPECS or raise if the list cannot be used as a smoke gate."""
    if not SMOKE_SPECS:
        raise ValueError("empty-smoke-specs")
    missing = [spec for spec in SMOKE_SPECS if not (Path(repo) / "frontend" / spec).is_file()]
    if missing:
        raise ValueError("missing-smoke-specs:" + ",".join(missing))
    return SMOKE_SPECS


def select(repo, event_name, event, tested_sha):
    if event_name == "schedule" or event_name == "merge_group":
        return full("explicit-full-event")
    if event_name == "workflow_dispatch":
        # Always tests github.sha of the selected ref. purpose=release does not
        # retarget another commit; it records that this SHA is the ship revision.
        purpose = (event.get("inputs") or {}).get("purpose") or "full-regression"
        if purpose == "release":
            return full("manual-release-gate")
        if purpose != "full-regression":
            return full("invalid-dispatch-purpose")
        return full("explicit-full-event")
    try:
        if git(repo, "rev-parse", "--is-shallow-repository").strip() != b"false":
            return full("shallow-history")
        tested = commit(repo, tested_sha)
        if git(repo, "rev-parse", "HEAD").decode().strip() != tested:
            return full("checkout-sha-mismatch")
        if event_name == "push":
            if event.get("forced") or event.get("created") or event.get("deleted"):
                return full("initial-forced-or-deleted-push")
            if event.get("ref", "").startswith("refs/tags/"):
                return full("release-tag")
            before = commit(repo, event.get("before"))
            after = commit(repo, event.get("after"))
            if tested != after:
                return full("push-sha-mismatch")
            git(repo, "merge-base", "--is-ancestor", before, after)
            paths = changed(repo, before, after)
        elif event_name == "pull_request":
            pr = event["pull_request"]
            base = commit(repo, pr["base"]["sha"])
            head = commit(repo, pr["head"]["sha"])
            parents = git(repo, "show", "-s", "--format=%P", tested).decode().split()
            if parents != [base, head]:
                return full("pr-merge-parents-mismatch")
            merge_base = git(repo, "merge-base", base, head).decode().strip()
            # Three-dot PR diff, plus target-branch drift and actual merge result.
            # This over-selects rather than missing cross-branch interactions.
            paths = (changed(repo, merge_base, head) | changed(repo, merge_base, base)
                     | changed(repo, base, tested))
        else:
            return full("unknown-event")
        result = classify(paths)
        result["changed_count"] = len(paths)
        return result
    except (OSError, ValueError, KeyError, TypeError, AttributeError, subprocess.SubprocessError):
        # Do not print arbitrary git/event data. Missing bases or a broken diff
        # must never silently turn into HEAD^ or an empty set of tests.
        return full("change-detection-failed")


def verify(needs, require_full=False):
    """A skipped required suite is NOT success; only intentional skips pass."""
    selection = needs.get("select", {})
    if selection.get("result") != "success":
        return False
    outputs = selection.get("outputs", {})
    if outputs.get("full") not in ("true", "false"):
        return False
    docs_only = outputs.get("docs_only")
    if docs_only not in (None, "true", "false"):
        return False
    if docs_only == "true":
        # Explicit Knowledge/ markdown only. Do not generalize to any empty set.
        if require_full or outputs.get("full") != "false":
            return False
        if outputs.get("playwright_mode") != "none":
            return False
        if any(outputs.get(suite) != "false" for suite in SUITES):
            return False
        return all(needs.get(suite, {}).get("result") == "skipped" for suite in SUITES)
    if not any(outputs.get(suite) == "true" for suite in SUITES):
        return False
    if outputs.get("full") == "true" and any(outputs.get(suite) != "true" for suite in SUITES):
        return False
    if require_full and outputs.get("full") != "true":
        return False
    for suite in SUITES:
        flag = outputs.get(suite)
        if flag not in ("true", "false"):
            return False
        required = require_full or flag == "true"
        expected = "success" if required else "skipped"
        if needs.get(suite, {}).get("result") != expected:
            return False
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    parser.add_argument("--require-full", action="store_true")
    parser.add_argument("--smoke-specs", action="store_true")
    args = parser.parse_args()
    if args.smoke_specs:
        try:
            print("\n".join(smoke_specs_or_error(Path(__file__).resolve().parents[2])))
        except ValueError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        return 0
    if args.verify:
        try:
            ok = verify(json.loads(os.environ["NEEDS_JSON"]), args.require_full)
        except (KeyError, ValueError, TypeError, AttributeError):
            ok = False
        print("Application gate: " + ("PASS" if ok else "FAIL"))
        return 0 if ok else 1
    repo = Path(__file__).resolve().parents[2]
    try:
        event = json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
        result = select(repo, os.environ.get("GITHUB_EVENT_NAME", ""), event,
                        os.environ.get("GITHUB_SHA", ""))
    except (OSError, ValueError, KeyError, TypeError):
        result = full("event-unavailable")
    print(json.dumps(result, sort_keys=True))
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        for key, value in result.items():
            rendered = str(value).lower() if isinstance(value, bool) else str(value)
            output.write(f"{key}={rendered}\n")
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write("## Application CI selection\n\n```json\n"
                          + json.dumps(result, indent=2, sort_keys=True) + "\n```\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
