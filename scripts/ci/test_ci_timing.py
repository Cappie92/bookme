"""CI timing summary and Playwright install retries. No network, no apt."""

import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))

import ci_timing_summary as summary  # noqa: E402

RUN_START = "2026-10-26T21:40:00Z"


def step(name, start, end, conclusion="success"):
    return {"name": name, "started_at": start, "completed_at": end, "conclusion": conclusion}


def job(name, start, end, steps=(), conclusion="success"):
    return {"name": name, "started_at": start, "completed_at": end,
            "conclusion": conclusion, "steps": list(steps)}


def full_run_jobs():
    return [
        job("select", "2026-10-26T21:40:02Z", "2026-10-26T21:40:20Z"),
        job("backend shard 1", "2026-10-26T21:40:25Z", "2026-10-26T21:48:40Z", [
            step("Set up job", "2026-10-26T21:40:25Z", "2026-10-26T21:40:27Z"),
            step("Run pytest shard", "2026-10-26T21:40:55Z", "2026-10-26T21:48:30Z"),
        ]),
        job("backend shard 2", "2026-10-26T21:40:25Z", "2026-10-26T21:47:10Z", [
            step("Run pytest shard", "2026-10-26T21:40:57Z", "2026-10-26T21:47:00Z"),
        ]),
        job("backend collection", "2026-10-26T21:40:25Z", "2026-10-26T21:41:10Z"),
        job("backend", "2026-10-26T21:48:45Z", "2026-10-26T21:49:00Z"),
        job("frontend", "2026-10-26T21:40:25Z", "2026-10-26T21:41:30Z"),
        job("mobile", "2026-10-26T21:40:25Z", "2026-10-26T21:42:00Z"),
        job("playwright", "2026-10-26T21:40:25Z", "2026-10-26T21:57:10Z", [
            step("Install Playwright Chromium", "2026-10-26T21:41:30Z", "2026-10-26T21:53:14Z"),
            step("Run Playwright E2E", "2026-10-26T21:53:14Z", "2026-10-26T21:57:11Z"),
        ]),
        job("Application CI result", "2026-10-26T21:57:15Z", "2026-10-26T21:57:30Z"),
    ]


class SummaryTests(unittest.TestCase):
    def test_step_timings_not_job_timings(self):
        text = summary.build_summary(full_run_jobs(), RUN_START, [])
        self.assertIn("| backend shard 1: pytest step | 7m 35s |", text)
        self.assertIn("| backend shard 2: pytest step | 6m 03s |", text)
        self.assertIn("| backend shard 1: setup (checkout, Python, pip) | 30s |", text)
        self.assertIn("| playwright: install Chromium | 11m 44s |", text)
        self.assertIn("| playwright: E2E step | 3m 57s |", text)
        self.assertIn("| playwright: setup (checkout, Python, Node, npm ci) | 1m 05s |", text)
        self.assertIn("**Critical path:** `playwright` finished last, 17m 10s after run start.", text)
        self.assertNotIn("Application CI result", text)
        self.assertNotIn("WARNING", text)

    def test_missing_profile_modules_and_skew_warn(self):
        jobs = full_run_jobs()
        jobs[2]["steps"][0]["completed_at"] = "2026-10-26T21:43:00Z"
        text = summary.build_summary(jobs, RUN_START, ["tests/test_new.py"])
        self.assertIn("profile is stale", text)
        self.assertIn("`tests/test_new.py`", text)
        self.assertIn("Backend shard skew", text)

    def test_small_skew_is_not_reported(self):
        self.assertEqual(summary.shard_warnings([400, 380], []), [])
        self.assertEqual(summary.shard_warnings([None, 380], []), [])

    def test_selected_run_without_shards_or_playwright(self):
        jobs = [
            job("select", "2026-10-26T21:40:02Z", "2026-10-26T21:40:20Z"),
            job("backend shard 1", None, None, conclusion="skipped"),
            job("backend", "2026-10-26T21:40:25Z", "2026-10-26T21:42:00Z"),
        ]
        text = summary.build_summary(jobs, RUN_START, [])
        self.assertIn("| backend shard 1: pytest step | n/a |", text)
        self.assertIn("| playwright: install Chromium | n/a |", text)
        self.assertIn("`backend` finished last", text)

    def test_no_data_at_all(self):
        text = summary.build_summary([], None, [])
        self.assertIn("n/a (no completed suite jobs)", text)

    def test_api_failure_still_writes_summary_and_exits_zero(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "summary.md"
            env = {"GITHUB_STEP_SUMMARY": str(out), "GITHUB_REPOSITORY": "o/r",
                   "GITHUB_RUN_ID": "1", "GITHUB_TOKEN": "x"}
            with mock.patch.dict(os.environ, env, clear=True), \
                    mock.patch.object(summary, "api", side_effect=OSError("down")):
                self.assertEqual(summary.main(), 0)
            self.assertIn("Timing data unavailable (OSError)", out.read_text(encoding="utf-8"))

    def test_missing_environment_is_not_an_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "summary.md"
            with mock.patch.dict(os.environ, {"GITHUB_STEP_SUMMARY": str(out)}, clear=True):
                self.assertEqual(summary.main(), 0)
            self.assertIn("Timing data unavailable (KeyError)", out.read_text(encoding="utf-8"))

    def test_real_profile_covers_every_module(self):
        self.assertEqual(summary.profile_missing_modules(), [])


class InstallRetryTests(unittest.TestCase):
    SCRIPT = Path(__file__).resolve().with_name("install-playwright-chromium.sh")

    def run_install(self, npx_codes):
        with tempfile.TemporaryDirectory() as tmp:
            bin_dir = Path(tmp)
            log = bin_dir / "calls.log"
            codes = bin_dir / "codes"
            codes.write_text("\n".join(str(c) for c in npx_codes) + "\n")
            stubs = {
                "sudo": f'echo "sudo $*" >> "{log}"; cat >/dev/null 2>&1 || true\n',
                "timeout": f'echo "timeout $1 $2" >> "{log}"; shift 2; exec "$@"\n',
                "npx": (
                    f'echo "npx $*" >> "{log}"\n'
                    f'code=$(head -n 1 "{codes}"); tail -n +2 "{codes}" > "{codes}.n"; '
                    f'mv "{codes}.n" "{codes}"; exit "$code"\n'
                ),
            }
            for name, body in stubs.items():
                path = bin_dir / name
                path.write_text("#!/usr/bin/env bash\n" + body)
                path.chmod(0o755)
            result = subprocess.run(
                ["bash", str(self.SCRIPT)], stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                env={**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}"},
            )
            return result, log.read_text().splitlines()

    def test_first_attempt_success(self):
        result, calls = self.run_install([0])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("sudo tee /etc/apt/apt.conf.d/80-dedato-ci-network", calls)
        self.assertIn("timeout --kill-after=30 180", calls)
        self.assertIn("npx playwright install --with-deps --only-shell chromium", calls)
        self.assertEqual(sum(c.startswith("npx") for c in calls), 1)

    def test_timeout_then_success_repairs_dpkg(self):
        result, calls = self.run_install([124, 0])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("exceeded 180s", result.stdout)
        self.assertIn("sudo dpkg --configure -a", calls)
        self.assertIn("timeout --kill-after=30 300", calls)

    def test_every_attempt_failing_fails_the_step(self):
        result, calls = self.run_install([1, 124, 1])
        self.assertEqual(result.returncode, 1)
        self.assertEqual(sum(c.startswith("npx") for c in calls), 3)
        self.assertIn("timeout --kill-after=30 420", calls)
        self.assertIn("::error title=Playwright install::all 3 attempts failed (last: exit 1)",
                      result.stdout)

    def test_workflow_uses_the_install_script(self):
        workflow = Path(__file__).resolve().parents[2] / ".github" / "workflows" / "tests.yml"
        text = workflow.read_text(encoding="utf-8")
        self.assertIn("bash ../scripts/ci/install-playwright-chromium.sh", text)
        self.assertNotIn("run: npx playwright install", text)


if __name__ == "__main__":
    unittest.main()
