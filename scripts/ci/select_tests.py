#!/usr/bin/env python3
"""Conservative suite selection. Any uncertainty means full application CI.

No GitHub API/path-list truncation, package imports, or network requests. PR tests
still run the checkout action's merge commit, not an unmerged branch snapshot.
"""

import argparse
import ast
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
# Pytest modules only. Helpers and notes under backend/tests/ stay ambiguous.
BACKEND_TEST_MODULE = re.compile(r"backend/tests/test_[A-Za-z0-9_]+\.py\Z")
BACKEND_PYTEST_PATH = re.compile(r"tests/test_[A-Za-z0-9_]+\.py\Z")
BACKEND_CONFTEST = "backend/tests/conftest.py"


def full(reason):
    return {**{suite: True for suite in SUITES}, "full": True, "docs_only": False,
            "playwright_mode": "full", "backend_scope": "all", "backend_paths": "",
            "reason": reason}


def knowledge_docs(reason="knowledge-docs"):
    """Knowledge/ markdown is living project docs, not application runtime.

    MkDocs builds `docs/`. Docker/frontend/mobile copy paths do not include
    Knowledge/. A zero-suite result is allowed only for this explicit class.
    """
    return {**{suite: False for suite in SUITES}, "full": False, "docs_only": True,
            "playwright_mode": "none", "backend_scope": "off", "backend_paths": "",
            "reason": reason}


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
    backend_modules = []
    saw_conftest = False
    for path in sorted(app_paths):
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
            if BACKEND_TEST_MODULE.fullmatch(path):
                chosen["backend"] = True
                backend_modules.append("tests/" + PurePosixPath(path).name)
            elif path == BACKEND_CONFTEST:
                # Shared by every backend test, and by nothing in frontend,
                # mobile or Playwright. Run the whole backend suite only.
                chosen["backend"] = True
                saw_conftest = True
            else:
                return full("backend-test-support-ambiguous")
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
    if chosen["backend"] and (saw_conftest or not backend_modules):
        scope, module_list = "all", ""
    elif chosen["backend"]:
        scope = "selected"
        module_list = ",".join(sorted(set(backend_modules)))
    else:
        scope, module_list = "off", ""
    only_backend = chosen["backend"] and not any(
        chosen[suite] for suite in SUITES if suite != "backend")
    if only_backend and saw_conftest:
        reason = "backend-test-configuration"
    elif only_backend and scope == "selected":
        reason = "backend-test-modules"
    elif landing:
        reason = "landing-only"
    else:
        reason = "known-package-scope"
    return {**chosen, "full": False, "docs_only": False,
            "playwright_mode": "smoke" if landing else "full",
            "backend_scope": scope, "backend_paths": module_list, "reason": reason}


class _UnresolvedTestImport(Exception):
    """A test module import could not be resolved from the AST alone."""


def _test_module_paths(backend):
    tests = Path(backend) / "tests"
    if not tests.is_dir():
        return []
    found = []
    for path in sorted(tests.rglob("test_*.py")):
        if not path.is_file():
            continue
        relative = path.relative_to(backend).as_posix()
        if relative.startswith("tests/") and ".." not in relative.split("/"):
            found.append(relative)
    return found


def _is_test_module_name(name):
    return re.fullmatch(r"test_[A-Za-z0-9_]+", name) is not None


def _candidate_test_paths(dotted):
    parts = [part for part in dotted.split(".") if part]
    if not parts:
        return []
    candidates = []
    if len(parts) == 1 and _is_test_module_name(parts[0]):
        candidates.append("tests/" + parts[0] + ".py")
    if parts[0] == "tests" and len(parts) > 1:
        candidates.append("tests/" + "/".join(parts[1:]) + ".py")
    if len(parts) >= 3 and parts[0] == "backend" and parts[1] == "tests":
        candidates.append("tests/" + "/".join(parts[2:]) + ".py")
    return candidates


def _resolve_dotted_test_module(dotted, known):
    candidates = _candidate_test_paths(dotted)
    if not candidates:
        if any(_is_test_module_name(part) for part in dotted.split(".")):
            raise _UnresolvedTestImport(dotted)
        return None
    found = [candidate for candidate in candidates if candidate in known]
    if len(found) == 1:
        return found[0]
    if found:
        raise _UnresolvedTestImport(dotted)
    if any(_is_test_module_name(PurePosixPath(candidate).stem) for candidate in candidates):
        raise _UnresolvedTestImport(dotted)
    return None


def _relative_directory(source, level):
    directory = list(PurePosixPath(source).parts[:-1])
    if level < 1 or level > len(directory):
        raise _UnresolvedTestImport(source)
    return directory[: len(directory) - (level - 1)]


def _call_dotted_name(node):
    if isinstance(node, ast.Name):
        return node.id
    parts = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, ast.Name):
        parts.append(node.id)
        return ".".join(reversed(parts))
    return None


def _string_constant(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return None


def _imports_from_tree(tree, source, known):
    """Test modules this file imports. Raises when an import is not static."""
    dependencies = set()

    def add_dotted(dotted):
        resolved = _resolve_dotted_test_module(dotted, known)
        if resolved and resolved != source:
            dependencies.add(resolved)

    def add_relative(level, module, names):
        directory = _relative_directory(source, level)
        if module:
            relative = "/".join(directory + module.split(".")) + ".py"
            if relative in known:
                if relative != source:
                    dependencies.add(relative)
                return
            leaf = module.split(".")[-1]
            if _is_test_module_name(leaf):
                raise _UnresolvedTestImport(module)
            return
        for alias in names:
            if alias.name == "*":
                raise _UnresolvedTestImport(source)
            if not _is_test_module_name(alias.name):
                continue
            relative = "/".join(directory + [alias.name]) + ".py"
            if relative not in known:
                raise _UnresolvedTestImport(alias.name)
            if relative != source:
                dependencies.add(relative)

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                add_dotted(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                add_relative(node.level, node.module, node.names)
                continue
            module = node.module or ""
            if module in {"tests", "backend.tests"} and any(alias.name == "*" for alias in node.names):
                raise _UnresolvedTestImport(module)
            try:
                resolved = _resolve_dotted_test_module(module, known) if module else None
            except _UnresolvedTestImport:
                raise
            if resolved:
                if resolved != source:
                    dependencies.add(resolved)
                continue
            for alias in node.names:
                if alias.name == "*":
                    continue
                if _is_test_module_name(alias.name) or module == "tests" or module.startswith("tests."):
                    add_dotted(module + "." + alias.name if module else alias.name)
        elif isinstance(node, ast.Call):
            called = _call_dotted_name(node.func)
            if called in {"importlib.import_module", "import_module", "__import__"}:
                if not node.args:
                    raise _UnresolvedTestImport(called)
                literal = _string_constant(node.args[0])
                if literal is None:
                    raise _UnresolvedTestImport(called)
                add_dotted(literal)
            elif called and called.endswith("spec_from_file_location"):
                for arg in list(node.args) + [keyword.value for keyword in node.keywords]:
                    literal = _string_constant(arg)
                    if literal is None:
                        continue
                    normalized = literal.replace("\\", "/")
                    matches = [item for item in known if normalized.endswith(item)]
                    if len(matches) > 1:
                        raise _UnresolvedTestImport(literal)
                    if len(matches) == 1 and matches[0] != source:
                        dependencies.add(matches[0])
                    elif PurePosixPath(normalized).name.startswith("test_") and normalized.endswith(".py"):
                        raise _UnresolvedTestImport(literal)
    return dependencies


def backend_test_importers(repo, selected):
    """Other test modules that import one of ``selected``, including chains.

    Raises ``_UnresolvedTestImport`` when the AST is not enough to trust a
    narrowed module list.
    """
    backend = Path(repo) / "backend"
    modules = _test_module_paths(backend)
    known = set(modules)
    graph = {}
    for relative in modules:
        path = backend / relative
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=relative)
        except (OSError, SyntaxError, UnicodeError) as exc:
            raise _UnresolvedTestImport(relative) from exc
        graph[relative] = _imports_from_tree(tree, relative, known)
    reverse = {}
    for importer, dependencies in graph.items():
        for dependency in dependencies:
            reverse.setdefault(dependency, set()).add(importer)
    importers = set()
    stack = list(selected)
    while stack:
        current = stack.pop()
        for importer in reverse.get(current, ()):
            if importer in selected or importer in importers:
                continue
            importers.add(importer)
            stack.append(importer)
    return importers


def resolve_backend_modules(repo, result):
    """Do not pass a deleted test path to pytest.

    Rename detection is off, so the diff still contains the old path. A missing
    module upgrades to the whole backend suite and still leaves the other
    application suites out. A changed module that another test imports does too:
    running only the edited file would skip those dependents.
    """
    if result.get("backend_scope") != "selected":
        return result
    raw = [part for part in str(result.get("backend_paths") or "").split(",") if part]
    if not raw or any(BACKEND_PYTEST_PATH.fullmatch(part) is None for part in raw):
        return {**result, "backend_scope": "all", "backend_paths": "",
                "reason": "backend-test-plan-invalid"}
    root = Path(repo) / "backend"
    if any(not (root / part).is_file() for part in raw):
        return {**result, "backend_scope": "all", "backend_paths": "",
                "reason": "backend-test-module-missing"}
    try:
        importers = backend_test_importers(repo, raw)
    except _UnresolvedTestImport:
        return {**result, "backend_scope": "all", "backend_paths": "",
                "reason": "backend-test-import-unresolved"}
    if importers:
        return {**result, "backend_scope": "all", "backend_paths": "",
                "reason": "backend-test-module-imported"}
    return result


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
        result = resolve_backend_modules(repo, classify(paths))
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
