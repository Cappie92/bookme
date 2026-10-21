"""Shard planning uses durations and whole modules. No application imports."""

import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest

from backend_shards import (
    aggregate_ok, assign_shards, check_nodeids, discover_modules,
    durations_from_junit, module_weights, nodeids,
)


class ShardPlanTests(unittest.TestCase):
    def test_longest_modules_land_on_different_shards(self):
        modules = ["tests/test_slow.py", "tests/test_also_slow.py", "tests/test_fast.py"]
        weights = {
            "tests/test_slow.py": 100.0,
            "tests/test_also_slow.py": 90.0,
            "tests/test_fast.py": 1.0,
        }
        buckets, loads = assign_shards(modules, weights, shards=2)
        self.assertEqual(sorted(buckets[0] + buckets[1]), sorted(modules))
        self.assertFalse(set(buckets[0]) & set(buckets[1]))
        self.assertIn("tests/test_slow.py", buckets[0])
        self.assertIn("tests/test_also_slow.py", buckets[1])
        self.assertLessEqual(max(loads) - min(loads), 100 * 1000)

    def test_new_module_is_included_with_median_duration(self):
        modules = ["tests/test_known.py", "tests/test_new.py"]
        weights, estimated = module_weights(modules, {"tests/test_known.py": 4.0})
        buckets, _loads = assign_shards(modules, weights, shards=2)
        self.assertEqual(estimated, ["tests/test_new.py"])
        self.assertEqual(weights["tests/test_new.py"], 4.0)
        self.assertEqual(sorted(buckets[0] + buckets[1]), modules)
        self.assertTrue(all(buckets))

    def test_junit_total_time_is_summed_per_module(self):
        with tempfile.TemporaryDirectory() as temp:
            backend = Path(temp)
            tests = backend / "tests"
            tests.mkdir()
            (tests / "test_one.py").write_text("def test_a():\n    pass\n")
            (tests / "test_two.py").write_text("def test_b():\n    pass\n")
            xml = Path(temp) / "junit.xml"
            xml.write_text(textwrap.dedent("""\
                <?xml version="1.0" encoding="utf-8"?>
                <testsuite>
                  <testcase classname="tests.test_one" name="test_a" time="1.25"
                            file="tests/test_one.py"/>
                  <testcase classname="tests.test_one" name="test_c" time="0.75"
                            file="tests/test_one.py"/>
                  <testcase classname="tests.test_two.Suite" name="test_b" time="3"
                            file="tests/test_two.py"/>
                </testsuite>
                """))
            durations = durations_from_junit(xml, discover_modules(backend))
            self.assertEqual(durations["tests/test_one.py"], 2.0)
            self.assertEqual(durations["tests/test_two.py"], 3.0)

    def test_node_id_union_must_match_the_full_collection(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            full = root / "all.txt"
            shard_a = root / "a.txt"
            shard_b = root / "b.txt"
            full.write_text(
                "tests/test_a.py::test_one\n"
                "tests/test_b.py::test_two[1]\n"
                "tests/test_b.py::test_two[Москва, 1]\n"
                "warning: ignore this line\n"
                "\n2 tests collected in 0.10s\n"
            )
            shard_a.write_text("tests/test_a.py::test_one\n")
            shard_b.write_text(
                "tests/test_b.py::test_two[1]\n"
                "tests/test_b.py::test_two[Москва, 1]\n"
            )
            self.assertEqual(check_nodeids(full, [shard_a, shard_b]), 3)
            shard_b.write_text("tests/test_a.py::test_one\n")
            with self.assertRaises(SystemExit):
                check_nodeids(full, [shard_a, shard_b])
            self.assertEqual(nodeids(full), [
                "tests/test_a.py::test_one",
                "tests/test_b.py::test_two[1]",
                "tests/test_b.py::test_two[Москва, 1]",
            ])
            broken = root / "broken.txt"
            broken.write_text("tests/not_a_module.py::test_one\n")
            with self.assertRaises(SystemExit):
                nodeids(broken)

    def test_summary_text_inside_a_parameter_is_a_real_node_id(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            full = root / "all.txt"
            shard_a = root / "a.txt"
            shard_b = root / "b.txt"
            full.write_text(
                "tests/test_a.py::test_ok\n"
                "tests/test_b.py::test_ok\n"
                "tests/test_c.py::test_param[tests collected]\n"
                "tests/test_c.py::test_spaces[a b]\n"
                "tests/test_c.py::test_ru[Москва, 1]\n"
                "1379 tests collected in 0.40s\n"
                "1 test collected in 0.01s\n"
                "no tests collected in 0.00s\n"
                "3/5 tests collected (2 deselected) in 1.25s\n"
                "2 tests collected, 1 error in 0.50s\n"
                "========\n"
            )
            shard_a.write_text("tests/test_a.py::test_ok\n")
            shard_b.write_text("tests/test_b.py::test_ok\n")
            with self.assertRaises(SystemExit) as missing:
                check_nodeids(full, [shard_a, shard_b])
            self.assertIn("missing=3", str(missing.exception))
            shard_b.write_text(
                "tests/test_b.py::test_ok\n"
                "tests/test_c.py::test_param[tests collected]\n"
                "tests/test_c.py::test_spaces[a b]\n"
                "tests/test_c.py::test_ru[Москва, 1]\n"
                "2 tests collected in 0.10s\n"
            )
            self.assertEqual(check_nodeids(full, [shard_a, shard_b]), 5)
            shard_a.write_text(
                "tests/test_a.py::test_ok\n"
                "tests/test_a.py::test_ok\n"
            )
            with self.assertRaises(SystemExit) as duplicate:
                check_nodeids(full, [shard_a, shard_b])
            self.assertIn("duplicate", str(duplicate.exception))
            extra = root / "extra.txt"
            extra.write_text("tests/test_a.py::test_ok\ntests/test_extra.py::test_extra\n")
            with self.assertRaises(SystemExit) as unexpected:
                check_nodeids(full, [shard_b, extra])
            self.assertIn("extra=1", str(unexpected.exception))

    def test_aggregate_fails_when_a_required_shard_does_not_succeed(self):
        self.assertTrue(aggregate_ok("all", "success", "success"))
        self.assertTrue(aggregate_ok("", "success", "success"))
        self.assertTrue(aggregate_ok("selected", "skipped", "skipped"))
        for shard, collect in (
            ("failure", "success"), ("cancelled", "success"), ("skipped", "success"),
            ("success", "failure"), ("success", "cancelled"), ("success", "skipped"),
        ):
            with self.subTest(shard=shard, collect=collect):
                self.assertFalse(aggregate_ok("all", shard, collect))
        self.assertFalse(aggregate_ok("selected", "success", "skipped"))
        self.assertFalse(aggregate_ok("selected", "skipped", "success"))
        self.assertFalse(aggregate_ok("selected", "failure", "skipped"))
        self.assertFalse(aggregate_ok("selected", "cancelled", "skipped"))
        self.assertFalse(aggregate_ok("selected", "skipped", "failure"))
        self.assertFalse(aggregate_ok("selected", "skipped", "cancelled"))


class ShardGeneratorExitTests(unittest.TestCase):
    """The workflow must not treat a failed shard generator as an empty success."""

    LOADER = """#!/bin/bash
set -euo pipefail
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
if ! "$1" > "$tmp"; then
  echo "Shard generation failed" >&2
  exit 1
fi
modules=()
while IFS= read -r module || [[ -n "$module" ]]; do
  [[ -n "$module" ]] && modules+=("$module")
done < "$tmp"
if [[ ${#modules[@]} -eq 0 ]]; then
  echo "ERROR: backend shard has no modules" >&2
  exit 1
fi
printf '%s\\n' "${modules[@]}"
"""

    def run_generator(self, code, output):
        with tempfile.TemporaryDirectory(prefix="dedato-shard-gen-") as temp:
            root = Path(temp)
            generator = root / "generate.sh"
            generator.write_text("#!/bin/bash\nprintf '%s' \"$OUTPUT\"\nexit \"$CODE\"\n")
            generator.chmod(0o755)
            loader = root / "load.sh"
            loader.write_text(self.LOADER)
            loader.chmod(0o755)
            return subprocess.run(
                ["bash", str(loader), str(generator)],
                check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                env={**os.environ, "OUTPUT": output, "CODE": str(code)},
            )

    def test_generator_exit_code_controls_the_shard_job(self):
        modules = "tests/test_a.py\ntests/test_b.py\n"
        passed = self.run_generator(0, modules)
        self.assertEqual(passed.returncode, 0, passed.stderr)
        self.assertEqual(passed.stdout, "tests/test_a.py\ntests/test_b.py\n")
        for code, output in (
            (7, ""),
            (7, "tests/test_a.py\n"),
            (7, modules),
        ):
            with self.subTest(code=code, output=output):
                failed = self.run_generator(code, output)
                self.assertEqual(failed.returncode, 1)
                self.assertIn("Shard generation failed", failed.stderr)
                self.assertNotEqual(failed.returncode, 0)
        empty = self.run_generator(0, "")
        self.assertEqual(empty.returncode, 1)
        self.assertIn("no modules", empty.stderr)
        self.assertNotIn("Shard generation failed", empty.stderr)

    def test_workflow_reads_the_generator_file_after_checking_its_status(self):
        workflow = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "tests.yml"
        text = workflow.read_text(encoding="utf-8")
        self.assertNotIn("done < <(python3", text)
        self.assertIn('tmp="$(mktemp)"', text)
        self.assertIn("Shard generation failed", text)
        self.assertIn('done < "$tmp"', text)


class LiveModuleTests(unittest.TestCase):
    def test_duration_profile_partitions_the_real_suite(self):
        from backend_shards import load_durations, DEFAULT_DURATIONS
        repo = Path(__file__).resolve().parents[2]
        modules = discover_modules(repo / "backend")
        durations = load_durations(DEFAULT_DURATIONS)
        weights, estimated = module_weights(modules, durations)
        buckets, loads = assign_shards(modules, weights, shards=2)
        for name in estimated:
            self.assertIn(name, modules)
        self.assertEqual(sorted(buckets[0] + buckets[1]), modules)
        self.assertFalse(set(buckets[0]) & set(buckets[1]))
        self.assertTrue(all(buckets))
        self.assertLessEqual(max(loads) - min(loads), max(
            int(round(weights[module] * 1000)) for module in modules))


if __name__ == "__main__":
    unittest.main()
