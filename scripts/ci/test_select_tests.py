"""Local metadata-only fixtures: no app, provider, production API or DB."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from select_tests import (
    LANDING, SMOKE_SPECS, SUITES, classify, full, knowledge_docs, select,
    smoke_specs_or_error, verify,
)


class SelectionMatrix(unittest.TestCase):
    def assert_suites(self, result, expected, full_run=False, mode="full", docs_only=False):
        self.assertEqual({s for s in SUITES if result[s]}, set(expected))
        self.assertEqual(result["full"], full_run)
        self.assertEqual(result["playwright_mode"], mode)
        self.assertEqual(result.get("docs_only", False), docs_only)

    def test_a_home_only(self):
        self.assert_suites(classify(["frontend/src/pages/Home.jsx"]),
                           ["frontend", "playwright"], mode="smoke")

    def test_landing_smoke_file_is_itself_selected(self):
        self.assert_suites(classify(LANDING), ["frontend", "playwright"], mode="smoke")

    def test_other_frontend_keeps_full_e2e(self):
        self.assert_suites(classify(["frontend/src/components/ui/Button.jsx"]),
                           ["frontend", "playwright"])

    def test_b_booking_limit_is_extended(self):
        self.assert_suites(classify(["backend/utils/booking_limit_guard.py"]), SUITES, True)

    def test_backend_tests_keep_backend_and_integration(self):
        self.assert_suites(classify(["backend/tests/test_bookings.py"]), ["backend", "playwright"])

    def test_c_mobile_only(self):
        self.assert_suites(classify(["mobile/src/components/Button.tsx"]), ["mobile"])

    def test_d_shared_and_api_contracts(self):
        for path in ("shared/subscriptionPlanFeatures.js", "backend/schemas.py",
                     "mobile/src/services/api/bookings.ts", "mobile/src/types/loyalty_discounts.ts",
                     "frontend/src/utils/api.js"):
            with self.subTest(path=path):
                self.assert_suites(classify([path]), SUITES, True)

    def test_e_migrations(self):
        self.assert_suites(classify(["backend/alembic/versions/new.py"]), SUITES, True)

    def test_f_all_configuration(self):
        for path in (".github/workflows/tests.yml", ".github/actions/setup/action.yml",
                     "scripts/ci/select_tests.py", "backend/pyproject.toml",
                     "backend/tests/conftest.py", "frontend/vite.config.js",
                     "frontend/playwright.config.ts", "frontend/package-lock.json",
                     "frontend/e2e/globalSetup.ts", "mobile/jest.unit.config.js",
                     "mobile/test-utils/setup.ts", "mobile/app.config.ts"):
            with self.subTest(path=path):
                self.assert_suites(classify([path]), SUITES, True)

    def test_g_full_events_need_no_base(self):
        for event in ("schedule", "workflow_dispatch", "merge_group"):
            with self.subTest(event=event):
                self.assert_suites(select("/does-not-exist", event, {}, ""), SUITES, True)

    def test_dispatch_purpose_stays_full_on_selected_ref_sha(self):
        cases = (
            ({}, "explicit-full-event"),
            ({"inputs": {"purpose": "full-regression"}}, "explicit-full-event"),
            ({"inputs": {"purpose": "release"}}, "manual-release-gate"),
            ({"inputs": {"purpose": "other"}}, "invalid-dispatch-purpose"),
        )
        for event, reason in cases:
            with self.subTest(event=event):
                result = select("/does-not-exist", "workflow_dispatch", event, "")
                self.assert_suites(result, SUITES, True)
                self.assertEqual(result["reason"], reason)

    def test_h_unknown_and_empty(self):
        for paths in ([], ["README.md"], ["docs/index.md"], ["new-package/src/file.ts"],
                      ["../Home.jsx"], ["frontend/src/pages/Home.jsx", "unknown"],
                      ["Knowledge/secret.yml"]):
            with self.subTest(paths=paths):
                self.assert_suites(classify(paths), SUITES, True)

    def test_knowledge_markdown_is_docs_only(self):
        self.assert_suites(classify(["Knowledge/ci-cd.md", "Knowledge/README.md"]),
                           [], mode="none", docs_only=True)

    def test_knowledge_plus_home_stays_landing_smoke(self):
        self.assert_suites(
            classify(["Knowledge/ci-cd.md", "frontend/src/pages/Home.jsx"]),
            ["frontend", "playwright"], mode="smoke",
        )

    def test_mixed_scope_is_union_not_landing_smoke(self):
        self.assert_suites(classify(["frontend/src/pages/Home.jsx", "mobile/app/login.tsx"]),
                           ["frontend", "mobile", "playwright"])

    def test_smoke_specs_exist_and_preserve_live_coverage(self):
        repo = Path(__file__).resolve().parents[2]
        specs = smoke_specs_or_error(repo)
        self.assertEqual(specs, SMOKE_SPECS)
        for spec in specs:
            self.assertTrue((repo / "frontend" / spec).is_file(), spec)
        self.assertIn("e2e/home.spec.ts", specs)
        self.assertIn("e2e/public-booking.spec.ts", specs)
        self.assertIn("e2e/client.spec.ts", specs)

    def test_smoke_specs_command_fails_closed_on_empty_or_missing(self):
        repo = Path(__file__).resolve().parents[2]
        with patch("select_tests.SMOKE_SPECS", ()):
            with self.assertRaisesRegex(ValueError, "empty-smoke-specs"):
                smoke_specs_or_error(repo)
        with patch("select_tests.SMOKE_SPECS", ("e2e/does-not-exist.spec.ts",)):
            with self.assertRaisesRegex(ValueError, "missing-smoke-specs"):
                smoke_specs_or_error(repo)
        completed = subprocess.run(
            ["python3", "-B", str(repo / "scripts/ci/select_tests.py"), "--smoke-specs"],
            check=False, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        self.assertEqual(completed.returncode, 0)
        self.assertEqual(completed.stdout.splitlines(), list(SMOKE_SPECS))


class GitEventTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="dedato-ci-selection-")
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.env = {**os.environ, "GIT_CONFIG_GLOBAL": os.devnull,
                    "GIT_CONFIG_NOSYSTEM": "1", "GIT_CONFIG_COUNT": "0"}
        # No parent worktree/index/hook configuration may enter the disposable repo.
        for key in ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"):
            self.env.pop(key, None)
        self.git("init", "-q")
        self.git("config", "user.name", "CI fixture")
        self.git("config", "user.email", "ci-fixture@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.git("config", "core.hooksPath", os.devnull)
        self.base = self.save("frontend/src/pages/Home.jsx", "initial\n")

    def git(self, *args):
        return subprocess.run(["git", "-C", str(self.repo), *args], env=self.env,
                              check=True, stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE).stdout.decode().strip()

    def save(self, path, content):
        target = self.repo / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        self.git("add", "--", path)
        self.git("commit", "-qm", "disposable test fixture")
        return self.git("rev-parse", "HEAD")

    def push(self, before=None, **overrides):
        head = self.git("rev-parse", "HEAD")
        event = {"before": before or self.base, "after": head, "ref": "refs/heads/main"}
        event.update(overrides)
        return select(self.repo, "push", event, head)

    def test_push_uses_entire_before_after_not_last_commit(self):
        self.save("backend/utils/booking_limit_guard.py", "changed\n")
        self.save("frontend/src/pages/Home.jsx", "badge\n")
        self.assertTrue(self.push()["full"])

    def test_valid_push_is_selective(self):
        self.save("frontend/src/pages/Home.jsx", "badge\n")
        self.assertEqual(self.push()["playwright_mode"], "smoke")
        self.assertFalse(self.push()["backend"])

    def test_initial_missing_forced_and_tag_push_are_full(self):
        self.save("frontend/src/pages/Home.jsx", "badge\n")
        for overrides in ({"before": "0" * 40}, {"before": "f" * 40},
                          {"forced": True}, {"created": True}, {"deleted": True},
                          {"ref": "refs/tags/v1.2.3"}, {"after": self.base}):
            with self.subTest(overrides=overrides):
                self.assertTrue(self.push(**overrides)["full"])

    def test_non_ancestor_even_without_forced_flag_is_full(self):
        former = self.save("mobile/app/login.tsx", "former tip\n")
        self.git("checkout", "-qb", "rewrite", self.base)
        self.save("frontend/src/pages/Home.jsx", "replacement\n")
        self.assertTrue(self.push(before=former)["full"])

    def test_deleted_and_renamed_paths_keep_old_owner(self):
        before = self.save("backend/old.py", "old content\n")
        self.git("mv", "backend/old.py", "frontend/src/pages/Moved.jsx")
        self.git("commit", "-qm", "disposable rename")
        self.assertTrue(self.push(before=before)["full"])

    def test_nul_diff_handles_many_files_and_spaces(self):
        for index in range(305):
            path = self.repo / "mobile" / "src" / f"file {index}.tsx"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("fixture\n")
        self.git("add", ".")
        self.git("commit", "-qm", "disposable many paths")
        result = self.push()
        self.assertEqual(result["changed_count"], 305)
        self.assertTrue(result["mobile"])
        self.assertFalse(result["backend"])

    def pr(self, base, head):
        tested = self.git("rev-parse", "HEAD")
        return select(self.repo, "pull_request",
                      {"pull_request": {"base": {"sha": base}, "head": {"sha": head}}}, tested)

    def test_pr_uses_merge_base_and_tests_merge_checkout(self):
        head = self.save("frontend/src/pages/Home.jsx", "badge\n")
        self.git("checkout", "-qb", "pr-merge", self.base)
        self.git("merge", "--no-ff", "-qm", "disposable PR merge", head)
        self.assertEqual(self.pr(self.base, head)["playwright_mode"], "smoke")

    def test_pr_target_drift_is_not_lost(self):
        head = self.save("frontend/src/pages/Home.jsx", "badge\n")
        self.git("checkout", "-qb", "updated-base", self.base)
        base = self.save("backend/api.py", "target change\n")
        self.git("merge", "--no-ff", "-qm", "disposable PR merge", head)
        self.assertTrue(self.pr(base, head)["full"])

    def test_unmerged_pr_checkout_falls_back(self):
        head = self.save("frontend/src/pages/Home.jsx", "badge\n")
        self.assertTrue(self.pr(self.base, head)["full"])

    def test_bad_event_or_git_failure_falls_back(self):
        self.assertTrue(select(self.repo, "pull_request", {}, self.base)["full"])
        self.assertTrue(select(self.repo, "unknown", {}, self.base)["full"])
        with patch("select_tests.git", side_effect=subprocess.TimeoutExpired("git", 30)):
            self.assertTrue(self.push()["full"])
        with patch("select_tests.git", return_value=b"true\n"):
            self.assertTrue(self.push()["full"])


class ResultGateTests(unittest.TestCase):
    def needs(self, decision):
        outputs = {k: str(v).lower() if isinstance(v, bool) else v for k, v in decision.items()}
        return {"select": {"result": "success", "outputs": outputs},
                **{s: {"result": "success" if decision[s] else "skipped"} for s in SUITES}}

    def test_intentional_skip_is_not_a_fake_test_run(self):
        needs = self.needs(classify(["mobile/app/login.tsx"]))
        self.assertTrue(verify(needs))
        self.assertFalse(verify(needs, require_full=True))

    def test_failed_cancelled_or_unexpectedly_skipped_suite_fails(self):
        for result in ("failure", "cancelled", "skipped", ""):
            needs = self.needs(full("test"))
            needs["backend"]["result"] = result
            self.assertFalse(verify(needs))
            self.assertFalse(verify(needs, require_full=True))

    def test_failed_selector_does_not_go_green(self):
        needs = self.needs(full("fallback"))
        needs["select"]["result"] = "failure"
        self.assertFalse(verify(needs))

    def test_missing_or_malformed_outputs_fail(self):
        needs = self.needs(full("test"))
        del needs["select"]["outputs"]["backend"]
        self.assertFalse(verify(needs))
        self.assertFalse(verify({}))

    def test_full_gate_requires_all_four_real_successes(self):
        self.assertTrue(verify(self.needs(full("release")), require_full=True))

    def test_docs_only_allows_skipped_suites_but_not_a_blank_zero_set(self):
        needs = self.needs(knowledge_docs())
        self.assertTrue(verify(needs))
        self.assertFalse(verify(needs, require_full=True))
        blank = self.needs({**{s: False for s in SUITES}, "full": False,
                            "playwright_mode": "none", "reason": "blank"})
        self.assertFalse(verify(blank))
        mixed = self.needs(knowledge_docs())
        mixed["select"]["outputs"]["frontend"] = "true"
        mixed["frontend"]["result"] = "success"
        self.assertFalse(verify(mixed))


if __name__ == "__main__":
    unittest.main()
