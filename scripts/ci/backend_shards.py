#!/usr/bin/env python3
"""Split backend pytest into whole-module shards using JUnit durations.

Each GitHub runner gets its own checkout and the disposable SQLite created by
backend/tests/conftest.py. This script only chooses module lists and checks
that collected node ids still match one full collection. It does not start
pytest-xdist and it does not divide a module between shards.
"""

import argparse
import json
import os
import re
import statistics
import sys
import xml.etree.ElementTree as ET
from pathlib import Path


# Parameters may contain spaces, non-ASCII text, and the words "tests collected".
NODE_ID = re.compile(r"tests/(?:[A-Za-z0-9_.-]+/)*test_[A-Za-z0-9_]+\.py::.+\Z")
# pytest 8 collect-only summary, after markup is stripped. Not a substring search:
# a node id such as test_param[tests collected] must stay a node id.
PYTEST_COLLECT_SUMMARY = re.compile(
    r"^(?:=+\s+)?"
    r"(?:"
    r"no tests collected(?: \(\d+ deselected\))?"
    r"|\d+ tests? collected"
    r"|\d+/\d+ tests collected \(\d+ deselected\)"
    r")"
    r"(?:, \d+ errors?)?"
    r" in \d+\.\d{2}s(?: \(\d+:\d{2}:\d{2}\))?"
    r"(?:\s+=+)?$"
)


DEFAULT_DURATIONS = Path(__file__).with_name("backend_module_durations.json")
SHARD_COUNT = 2


def discover_modules(backend):
    """Every pytest module under backend/tests, including future nested files."""
    tests = Path(backend) / "tests"
    modules = []
    for path in sorted(tests.rglob("test_*.py")):
        if not path.is_file():
            continue
        relative = path.relative_to(backend).as_posix()
        if relative.startswith("tests/") and ".." not in relative.split("/"):
            modules.append(relative)
    if not modules:
        raise SystemExit("no backend test modules")
    return modules


def load_durations(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    modules = data.get("modules")
    if not isinstance(modules, dict) or not modules:
        raise SystemExit("duration profile has no modules")
    loaded = {}
    for name, seconds in modules.items():
        if not isinstance(name, str) or not name.startswith("tests/") or not name.endswith(".py"):
            raise SystemExit(f"invalid duration module: {name}")
        loaded[name] = float(seconds)
        if loaded[name] < 0:
            raise SystemExit(f"negative duration: {name}")
    return loaded


def module_weights(modules, durations):
    """Real JUnit seconds, or the median for a module the profile does not know yet."""
    known = [durations[name] for name in modules if name in durations]
    if not known:
        raise SystemExit("duration profile does not cover any discovered module")
    fallback = statistics.median(known)
    weights = {}
    estimated = []
    for name in modules:
        if name in durations:
            weights[name] = durations[name]
        else:
            weights[name] = fallback
            estimated.append(name)
    return weights, estimated


def assign_shards(modules, weights, shards=SHARD_COUNT):
    """Longest-processing-time assignment. Returns sorted module lists and millisecond loads."""
    if shards < 1:
        raise SystemExit("shard count must be positive")
    buckets = [[] for _ in range(shards)]
    loads = [0 for _ in range(shards)]
    order = sorted(modules, key=lambda name: (-int(round(weights[name] * 1000)), name))
    for name in order:
        index = min(range(shards), key=lambda item: (loads[item], item))
        buckets[index].append(name)
        loads[index] += int(round(weights[name] * 1000))
    if len(modules) >= shards and any(not bucket for bucket in buckets):
        raise SystemExit("shard assignment left an empty shard")
    return [sorted(bucket) for bucket in buckets], loads


def case_module(case, modules):
    file_attr = (case.get("file") or "").replace("\\", "/")
    matches = [
        module for module in modules
        if file_attr == module or file_attr.endswith("/" + module)
    ]
    if matches:
        return max(matches, key=len)
    parts = (case.get("classname") or "").split(".")
    if parts and parts[0] == "tests":
        for end in range(len(parts), 1, -1):
            candidate = "/".join(parts[:end]) + ".py"
            if candidate in modules:
                return candidate
    return None


def durations_from_junit(xml_path, modules):
    """Sum testcase time. CI pins junit_duration_report=total, so this includes fixtures."""
    known = set(modules)
    totals = {module: 0.0 for module in modules}
    seen = set()
    for case in ET.parse(xml_path).getroot().iter("testcase"):
        module = case_module(case, known)
        if module is None:
            raise SystemExit(
                "junit testcase is not a discovered module: "
                + (case.get("classname") or case.get("name") or "unknown")
            )
        totals[module] += float(case.get("time") or 0)
        seen.add(module)
    missing = [module for module in modules if module not in seen]
    if missing:
        raise SystemExit("junit has no testcases for: " + ", ".join(missing))
    return {module: round(totals[module], 3) for module in modules}


def nodeids(path):
    found = []
    seen = set()
    for raw in Path(path).read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line:
            continue
        if NODE_ID.fullmatch(line) is not None:
            pass
        elif PYTEST_COLLECT_SUMMARY.fullmatch(line) is not None or set(line) <= {"="}:
            continue
        elif "::" in line or line.startswith("tests/"):
            raise SystemExit(f"unparsed node id in {path}: {line}")
        else:
            continue
        if line in seen:
            raise SystemExit(f"duplicate node id in {path}: {line}")
        seen.add(line)
        found.append(line)
    if not found:
        raise SystemExit(f"no node ids in {path}")
    return found


def check_nodeids(collection, shard_files):
    expected = nodeids(collection)
    seen = set()
    for shard in shard_files:
        for node in nodeids(shard):
            if node in seen:
                raise SystemExit(f"duplicate node id across shards: {node}")
            seen.add(node)
    missing = [node for node in expected if node not in seen]
    extra = [node for node in seen if node not in set(expected)]
    if missing or extra or len(seen) != len(expected):
        raise SystemExit(
            f"node id mismatch missing={len(missing)} extra={len(extra)} "
            f"union={len(seen)} collection={len(expected)}"
        )
    return len(seen)


def aggregate_ok(scope, shard_result, collect_result):
    """Selected modules run on the aggregator. A full suite requires both shard jobs.

    failure, cancelled and an unexpected skip are not success. A selected run
    must observe those jobs as skipped, otherwise modules could run twice or
    not at all.
    """
    if scope == "selected":
        return shard_result == "skipped" and collect_result == "skipped"
    return shard_result == "success" and collect_result == "success"


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--shard", type=int)
    parser.add_argument("--shards", type=int, default=SHARD_COUNT)
    parser.add_argument("--durations", type=Path, default=DEFAULT_DURATIONS)
    parser.add_argument("--backend", type=Path)
    parser.add_argument("--emit-durations", type=Path)
    parser.add_argument("--check-nodeids", nargs="+")
    parser.add_argument("--aggregate-decision", action="store_true")
    args = parser.parse_args(argv)
    backend = args.backend or Path(__file__).resolve().parents[2] / "backend"

    if args.aggregate_decision:
        ok = aggregate_ok(
            os.environ.get("BACKEND_SCOPE", ""),
            os.environ.get("SHARD_RESULT", ""),
            os.environ.get("COLLECT_RESULT", ""),
        )
        print("backend aggregate: " + ("PASS" if ok else "FAIL"))
        return 0 if ok else 1

    if args.check_nodeids:
        if len(args.check_nodeids) < 2:
            print("need a full collection and at least one shard", file=sys.stderr)
            return 1
        count = check_nodeids(args.check_nodeids[0], args.check_nodeids[1:])
        print(f"node ids: {count}")
        return 0

    modules = discover_modules(backend)
    if args.emit_durations:
        durations = durations_from_junit(args.emit_durations, modules)
        json.dump(
            {"junit_duration_report": "total", "modules": durations},
            sys.stdout, indent=2, sort_keys=True,
        )
        sys.stdout.write("\n")
        return 0

    if args.shard is None:
        print("pass --shard, --emit-durations, --check-nodeids, or --aggregate-decision",
              file=sys.stderr)
        return 1
    if not 1 <= args.shard <= args.shards:
        print("shard is outside 1..shards", file=sys.stderr)
        return 1
    weights, estimated = module_weights(modules, load_durations(args.durations))
    buckets, _loads = assign_shards(modules, weights, args.shards)
    if estimated:
        print("estimated duration for new modules: " + ", ".join(estimated), file=sys.stderr)
    sys.stdout.write("\n".join(buckets[args.shard - 1]) + "\n")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, ET.ParseError) as exc:
        print(f"backend shard plan failed: {exc.__class__.__name__}", file=sys.stderr)
        raise SystemExit(1)
