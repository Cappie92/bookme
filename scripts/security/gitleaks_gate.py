#!/usr/bin/env python3
"""Metadata-only Gitleaks gate. Never emit scanner stdout/stderr or source lines."""
from __future__ import annotations

import argparse
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile
import threading

VERSION = "8.21.2"
POLICY_FILES = (
    ".gitleaks.toml", ".gitleaks-current-exceptions.json",
    ".gitleaks-history-baseline.json", ".gitleaksignore",
    ".github/workflows/gitleaks.yml", "scripts/security/gitleaks_gate.py",
    "scripts/security/test_gitleaks_gate.py",
)
HISTORY_CLASSES = {
    "REVOKED_CREDENTIAL", "OBSOLETE_CREDENTIAL_CLOSED_STORE",
    "DOCUMENTATION_EXAMPLE", "FALSE_POSITIVE", "SYNTHETIC_FIXTURE",
    "EXPIRED_JWT_REMOVED",
}


class GateError(Exception):
    """Only a fixed, non-sensitive error code may cross the CLI boundary."""


def execute(args, *, cwd=None, timeout=300, input=None):
    try:
        return subprocess.run(args, cwd=cwd, capture_output=True, timeout=timeout, input=input)
    except (OSError, subprocess.SubprocessError):
        raise GateError("EXECUTION_ERROR") from None


def git(repo, *args):
    result = execute(["git", "-C", str(repo), *args])
    if result.returncode:
        raise GateError("GIT_ERROR")
    return result.stdout


def commit(repo, value):
    if value != "HEAD" and not re.fullmatch(r"[0-9a-f]{40}", value or ""):
        raise GateError("INVALID_COMMIT")
    if value == "0" * 40:
        raise GateError("MISSING_RANGE")
    resolved = git(repo, "rev-parse", "--verify", value + "^{commit}").decode().strip()
    if not re.fullmatch(r"[0-9a-f]{40}", resolved):
        raise GateError("INVALID_COMMIT")
    return resolved


def safe_path(value):
    path = PurePosixPath(value)
    if not value or path.is_absolute() or ".." in path.parts or "\x00" in value:
        raise GateError("INVALID_PATH")
    return path.as_posix()


def load_ledger(policy, filename, key):
    try:
        data = json.loads((policy / filename).read_text())
        if data["version"] != 1 or not isinstance(data[key], list):
            raise ValueError()
        return data[key]
    except (OSError, ValueError, KeyError, TypeError):
        raise GateError("INVALID_POLICY") from None


def snapshot(repo, head, destination):
    if head == "WORKTREE":
        names = git(repo, "ls-files", "--cached", "--others", "--exclude-standard", "-z")
        for name in set(names.decode().split("\0")) - {""}:
            name = safe_path(name)
            source = repo / name
            if not source.exists() and not source.is_symlink():
                continue  # A local, unstaged deletion is part of the candidate.
            target = destination / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if source.is_symlink():
                target.write_text(os.readlink(source))  # Never follow candidate links.
            elif source.is_file():
                target.write_bytes(source.read_bytes())
            else:
                raise GateError("UNSUPPORTED_TRACKED_ENTRY")
        return
    # Read raw blobs: git archive would trust candidate export-ignore attributes,
    # and checkout could apply filters. Neither may hide/change tracked content.
    entries = []
    for entry in git(repo, "ls-tree", "-rz", head).split(b"\0"):
        if not entry:
            continue
        fields, name = entry.split(b"\t", 1)
        mode, kind, oid = fields.split()
        if kind != b"blob" or mode not in (b"100644", b"100755", b"120000"):
            raise GateError("UNSUPPORTED_TRACKED_ENTRY")
        entries.append((safe_path(name.decode()), oid))
    result = execute(["git", "-C", str(repo), "cat-file", "--batch"],
                     input=b"".join(oid + b"\n" for _, oid in entries))
    if result.returncode:
        raise GateError("GIT_ERROR")
    data, offset = result.stdout, 0
    for name, oid in entries:
        end = data.index(b"\n", offset)
        actual, kind, size = data[offset:end].split()
        size = int(size)
        if actual != oid or kind != b"blob" or size < 0:
            raise GateError("INVALID_GIT_BLOB")
        start = end + 1
        if len(data) < start + size + 1 or data[start + size:start + size + 1] != b"\n":
            raise GateError("INVALID_GIT_BLOB")
        target = destination / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data[start:start + size])  # Symlinks are text, never followed.
        offset = start + size + 1
    if offset != len(data):
        raise GateError("INVALID_GIT_BLOB")


def scan(binary, source, config, ignore, log_opts=None):
    args = [str(binary), "detect", "--source", str(source), "--config", str(config),
            "--redact=100", "--no-banner", "--no-color", "--ignore-gitleaks-allow",
            "--gitleaks-ignore-path", str(ignore), "--report-format", "json"]
    args += ["--no-git"] if log_opts is None else ["--log-opts=" + log_opts]
    # A FIFO works on macOS and Linux; os.Create(/dev/stdout) does not on macOS.
    # A non-blocking reader also terminates if scanner startup fails without a report.
    with tempfile.TemporaryDirectory(prefix="gitleaks-report-") as tmp:
        fifo = Path(tmp) / "report.pipe"
        os.mkfifo(fifo, 0o600)
        fd = os.open(fifo, os.O_RDWR | os.O_NONBLOCK)
        chunks = []
        stopped = threading.Event()

        def drain():
            while True:
                try:
                    chunk = os.read(fd, 65536)
                    if chunk:
                        chunks.append(chunk)
                        continue
                except BlockingIOError:
                    pass
                if stopped.is_set():
                    return
                stopped.wait(0.01)

        reader = threading.Thread(target=drain, daemon=True)
        reader.start()
        try:
            result = execute(args + ["--report-path", str(fifo)], cwd=source)
        finally:
            stopped.set()
            reader.join()
            os.close(fd)
    # The full report exists in process memory only, never in a saved artifact.
    try:
        rows = json.loads(b"".join(chunks))
        if not isinstance(rows, list) or result.returncode not in (0, 1):
            raise ValueError()
        if re.search(rb"\b(?:ERR|FTL)\b", result.stderr):
            raise ValueError()  # Partial/error scans must not become a green gate.
        if bool(rows) != (result.returncode == 1):
            raise ValueError()
        for row in rows:
            if not isinstance(row, dict) or not isinstance(row.get("StartLine"), int):
                raise ValueError()
            for field in ["RuleID", "File"]:
                if not isinstance(row.get(field), str):
                    raise ValueError()
    except (ValueError, TypeError):
        raise GateError("SCANNER_ERROR") from None
    return rows


def metadata(row, source, historical):
    path = row["File"]
    if Path(path).is_absolute():
        try:
            path = Path(path).relative_to(source).as_posix()
        except ValueError:
            raise GateError("INVALID_SCANNER_PATH") from None
    path = safe_path(path)
    revision = row.get("Commit", "") if historical else ""
    if historical and not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise GateError("INVALID_SCANNER_COMMIT")
    rule = row["RuleID"]
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", rule):
        raise GateError("INVALID_SCANNER_RULE")
    line = row["StartLine"]
    if line < 1:
        raise GateError("INVALID_SCANNER_LINE")
    fingerprint = f"{revision + ':' if revision else ''}{path}:{rule}:{line}"
    return {"rule": rule, "file": path, "line": line, "fingerprint": fingerprint,
            "classification": "UNRESOLVED"}


def checksum_exception(item, row, text, exceptions):
    expected_guard = {"kind": "cocoapods_spec_checksum", "section": "SPEC CHECKSUMS",
                      "dependency": "AppMetricaKeychain", "hex_length": 40}
    approved = any(e.get("rule") == "generic-api-key"
                   and e.get("path") == "mobile/ios/Podfile.lock"
                   and e.get("classification") == "FALSE_POSITIVE_BUILD_CHECKSUM"
                   and e.get("guard") == expected_guard and e.get("rationale")
                   for e in exceptions)
    if not approved or item["rule"] != "generic-api-key" or item["file"] != "mobile/ios/Podfile.lock":
        return False
    if row.get("EndLine") != item["line"]:
        return False
    lines = text.splitlines()
    index = item["line"] - 1
    if index >= len(lines) or not re.fullmatch(r"  AppMetricaKeychain: [0-9a-fA-F]{40}", lines[index]):
        return False
    headers = [line for line in lines[:index] if line and not line[0].isspace()]
    return bool(headers) and headers[-1] == "SPEC CHECKSUMS:"


def history_exception(repo, item, revision, entries):
    for entry in entries:
        if (entry.get("fingerprint") == item["fingerprint"]
                and entry.get("rule") == item["rule"] and entry.get("path") == item["file"]
                and entry.get("line") == item["line"] and entry.get("commit") == revision
                and entry.get("classification") in HISTORY_CLASSES and entry.get("evidence")):
            blob = git(repo, "rev-parse", revision + ":" + item["file"]).decode().strip()
            if blob == entry.get("blob"):
                return True
    return False


def policy_changes(repo, head, policy, tree):
    changes = []
    for name in POLICY_FILES:
        trusted = policy / name
        candidate = tree / name
        # Policy paths must never be symlinks in the trusted checkout.
        if trusted.is_symlink():
            raise GateError("INVALID_POLICY_SYMLINK")
        a = trusted.read_bytes() if trusted.is_file() else None
        b = candidate.read_bytes() if candidate.is_file() else None
        if a != b:
            changes.append({"rule": "trusted-policy", "file": name, "line": 1,
                            "fingerprint": f"{head}:{name}:trusted-policy:1",
                            "classification": "POLICY_REVIEW_REQUIRED"})
    return changes


def gate(repo, policy, binary, mode, head="HEAD", before=None, check_policy=False):
    repo, policy = Path(repo).resolve(), Path(policy).resolve()
    version = execute([str(binary), "version"])
    if version.returncode or version.stdout.decode().strip() != VERSION:
        raise GateError("SCANNER_VERSION_MISMATCH")
    if git(repo, "rev-parse", "--is-shallow-repository").strip() != b"false":
        raise GateError("SHALLOW_HISTORY")
    if mode != "current-tree" or head != "WORKTREE":
        head = commit(repo, head)
    if mode == "incremental":
        if not before or before == "0" * 40:
            raise GateError("MISSING_RANGE")
        before = commit(repo, before)
    exceptions = load_ledger(policy, ".gitleaks-current-exceptions.json", "exceptions")
    history = load_ledger(policy, ".gitleaks-history-baseline.json", "findings")
    historical = mode != "current-tree"
    with tempfile.TemporaryDirectory(prefix="gitleaks-gate-") as tmp:
        tree = Path(tmp) / "tree"
        tree.mkdir()
        ignore = Path(tmp) / "empty.ignore"
        ignore.write_text("")
        if not historical or check_policy:
            snapshot(repo, head, tree)
        source = repo if historical else tree
        opts = None
        if historical:
            target = before + ".." + head if mode == "incremental" else head
            # Directed new reachable history, with individual merge-parent diffs.
            opts = "--full-history -m " + target
        rows = scan(binary, source, policy / ".gitleaks.toml", ignore, opts)
        results = []
        suppressed = baselined = 0
        for row in rows:
            item = metadata(row, source, historical)
            if item["file"] == "mobile/ios/Podfile.lock":
                content = (git(repo, "show", row["Commit"] + ":" + item["file"]).decode()
                           if historical else (tree / item["file"]).read_text())
                if checksum_exception(item, row, content, exceptions):
                    item["classification"] = "SUPPRESSED_REVIEWED_FALSE_POSITIVE"
                    suppressed += 1
            if item["classification"] == "UNRESOLVED" and historical:
                if history_exception(repo, item, row["Commit"], history):
                    item["classification"] = "BASELINED_REVIEWED_HISTORY"
                    baselined += 1
            results.append(item)
        if check_policy:
            results.extend(policy_changes(repo, head, policy, tree))
        unresolved = sum(i["classification"] in {"UNRESOLVED", "POLICY_REVIEW_REQUIRED"} for i in results)
        return {"mode": mode, "raw": len(rows), "suppressed_reviewed": suppressed,
                "baselined": baselined, "unresolved": unresolved, "findings": results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    parser.add_argument("--policy-dir", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--binary", default="gitleaks")
    parser.add_argument("--mode", choices=["current-tree", "incremental", "history"], required=True)
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--before")
    parser.add_argument("--check-policy-changes", action="store_true")
    args = parser.parse_args()
    try:
        result = gate(args.repo, args.policy_dir, args.binary, args.mode, args.head,
                      args.before, args.check_policy_changes)
        print(json.dumps(result, ensure_ascii=True))
        return 1 if result["unresolved"] else 0
    except GateError as exc:
        print(json.dumps({"classification": str(exc)}))
        return 2
    except Exception:
        # Never emit exception repr/traceback: a scanner or policy may contain secrets.
        print(json.dumps({"classification": "GATE_ERROR"}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
