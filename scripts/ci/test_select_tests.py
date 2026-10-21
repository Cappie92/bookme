"""Local metadata-only fixtures: no app, provider, production API or DB."""

import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from select_tests import (
    LANDING, SMOKE_SPECS, SUITES, classify, full, knowledge_docs,
    resolve_backend_modules, select, smoke_specs_or_error, verify,
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

    def test_backend_test_module_runs_only_that_module(self):
        result = classify(["backend/tests/test_bookings.py", "backend/tests/test_auth.py"])
        self.assert_suites(result, ["backend"])
        self.assertEqual(result["backend_scope"], "selected")
        self.assertEqual(result["backend_paths"], "tests/test_auth.py,tests/test_bookings.py")
        self.assertEqual(result["reason"], "backend-test-modules")

    def test_backend_conftest_runs_full_backend_suite_only(self):
        for paths in (
            ["backend/tests/conftest.py"],
            ["backend/tests/conftest.py", "backend/tests/test_bookings.py"],
            ["Knowledge/ci-cd.md", "backend/tests/conftest.py"],
        ):
            with self.subTest(paths=paths):
                result = classify(paths)
                self.assert_suites(result, ["backend"])
                self.assertEqual(result["backend_scope"], "all")
                self.assertEqual(result["backend_paths"], "")
                self.assertEqual(result["reason"], "backend-test-configuration")

    def test_backend_test_support_file_is_full_regression(self):
        self.assert_suites(
            classify(["backend/tests/SUBSCRIPTION_TESTS_REPORT.md"]), SUITES, True)
        self.assert_suites(classify(["backend/tests/helpers.py"]), SUITES, True)

    def test_backend_test_module_plus_other_suite_keeps_module_list(self):
        result = classify([
            "backend/tests/test_bookings.py", "mobile/src/components/Button.tsx",
        ])
        self.assert_suites(result, ["backend", "mobile"])
        self.assertEqual(result["backend_scope"], "selected")
        self.assertEqual(result["backend_paths"], "tests/test_bookings.py")

    def test_missing_backend_module_upgrades_to_full_backend_suite(self):
        classified = classify(["backend/tests/test_removed.py"])
        result = resolve_backend_modules(Path("/does-not-exist"), classified)
        self.assertEqual(result["backend_scope"], "all")
        self.assertEqual(result["backend_paths"], "")
        self.assertEqual(result["reason"], "backend-test-module-missing")
        self.assertFalse(result["playwright"])
        self.assertFalse(result["full"])

    def test_unsafe_backend_plan_is_not_passed_to_pytest(self):
        result = resolve_backend_modules(Path("."), {
            "backend_scope": "selected",
            "backend_paths": "tests/test_ok.py;echo",
            "backend": True, "frontend": False, "mobile": False, "playwright": False,
            "full": False, "docs_only": False, "playwright_mode": "full",
        })
        self.assertEqual(result["backend_scope"], "all")
        self.assertEqual(result["backend_paths"], "")
        self.assertEqual(result["reason"], "backend-test-plan-invalid")

    def test_audit_selector_matrix(self):
        repo = Path(__file__).resolve().parents[2]
        imported = resolve_backend_modules(
            repo, classify(["backend/tests/test_confirm_booking_created.py"]))
        self.assertEqual(imported["reason"], "backend-test-module-imported")
        self.assertEqual(imported["backend_scope"], "all")
        self.assertEqual(imported["backend_paths"], "")
        self.assertTrue(imported["backend"])
        self.assertFalse(imported["frontend"])
        self.assertFalse(imported["mobile"])
        self.assertFalse(imported["playwright"])
        self.assertFalse(imported["full"])
        independent = resolve_backend_modules(
            repo, classify(["backend/tests/test_bookings.py"]))
        self.assertEqual(independent["backend_scope"], "selected")
        self.assertEqual(independent["backend_paths"], "tests/test_bookings.py")
        self.assertFalse(independent["playwright"])
        self.assertFalse(independent["full"])
        conftest = resolve_backend_modules(repo, classify(["backend/tests/conftest.py"]))
        self.assertEqual(conftest["backend_scope"], "all")
        self.assertEqual(conftest["reason"], "backend-test-configuration")
        self.assertFalse(conftest["playwright"])
        self.assertFalse(conftest["full"])
        runtime = classify(["backend/utils/booking_limit_guard.py"])
        self.assert_suites(runtime, SUITES, True)
        unknown = classify(["new-package/src/file.ts"])
        self.assert_suites(unknown, SUITES, True)

    def _resolve_fixture(self, files, changed):
        with tempfile.TemporaryDirectory(prefix="dedato-import-graph-") as temp:
            root = Path(temp)
            for name, content in files.items():
                path = root / "backend" / "tests" / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(content)
            return resolve_backend_modules(root, classify([f"backend/tests/{changed}"]))

    def test_import_aliases_packages_and_chains_run_all_backend_tests(self):
        files = {
            "test_a.py": "def helper():\n    return 1\n",
            "test_b.py": "import test_a as helpers\nfrom tests.test_a import helper as renamed\n",
            "test_c.py": "from backend.tests.test_b import helpers\nfrom .test_b import helpers as again\n",
            "test_free.py": "def test_ok():\n    assert True\n",
        }
        imported = self._resolve_fixture(files, "test_a.py")
        self.assertEqual(imported["backend_scope"], "all")
        self.assertEqual(imported["reason"], "backend-test-module-imported")
        self.assertFalse(imported["playwright"])
        self.assertFalse(imported["full"])
        middle = self._resolve_fixture(files, "test_b.py")
        self.assertEqual(middle["backend_scope"], "all")
        leaf = self._resolve_fixture(files, "test_c.py")
        self.assertEqual(leaf["backend_scope"], "selected")
        self.assertEqual(leaf["backend_paths"], "tests/test_c.py")
        free = self._resolve_fixture(files, "test_free.py")
        self.assertEqual(free["backend_scope"], "selected")
        self.assertEqual(free["backend_paths"], "tests/test_free.py")

    def test_unresolved_import_falls_back_to_the_whole_backend_suite(self):
        dynamic = self._resolve_fixture({
            "test_free.py": "def test_ok():\n    assert True\n",
            "test_dyn.py": "import importlib\nname = 'test_free'\nimportlib.import_module(name)\n",
        }, "test_free.py")
        self.assertEqual(dynamic["backend_scope"], "all")
        self.assertEqual(dynamic["reason"], "backend-test-import-unresolved")
        self.assertFalse(dynamic["frontend"])
        self.assertFalse(dynamic["playwright"])
        self.assertFalse(dynamic["full"])
        literal = self._resolve_fixture({
            "test_free.py": "def test_ok():\n    assert True\n",
            "test_dyn.py": "import importlib\nimportlib.import_module('json')\n",
        }, "test_free.py")
        self.assertEqual(literal["backend_scope"], "selected")
        migration = self._resolve_fixture({
            "test_free.py": "def test_ok():\n    assert True\n",
            "test_mig.py": (
                "import importlib.util\nfrom pathlib import Path\n"
                "path = Path('alembic') / 'versions' / 'x.py'\n"
                "importlib.util.spec_from_file_location('migration', path)\n"
            ),
        }, "test_free.py")
        self.assertEqual(migration["backend_scope"], "selected")
        loaded = self._resolve_fixture({
            "test_a.py": "VALUE = 1\n",
            "test_loader.py": (
                "import importlib.util\n"
                "importlib.util.spec_from_file_location('loaded', 'tests/test_a.py')\n"
            ),
        }, "test_a.py")
        self.assertEqual(loaded["backend_scope"], "all")
        self.assertEqual(loaded["reason"], "backend-test-module-imported")

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
                     "scripts/ci/select_tests.py", "scripts/ci/backend_shards.py",
                     "scripts/ci/backend_module_durations.json", "backend/pyproject.toml",
                     "frontend/vite.config.js",
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
        result = classify(["Knowledge/ci-cd.md", "Knowledge/README.md"])
        self.assert_suites(result, [], mode="none", docs_only=True)
        self.assertEqual(result["backend_scope"], "off")
        self.assertEqual(result["backend_paths"], "")

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

    def test_push_of_backend_test_module_selects_that_file(self):
        self.save("backend/tests/test_bookings.py", "def test_ok():\n    assert True\n")
        result = self.push()
        self.assertEqual(result["backend_scope"], "selected")
        self.assertEqual(result["backend_paths"], "tests/test_bookings.py")
        self.assertTrue(result["backend"])
        self.assertFalse(result["playwright"])
        self.assertFalse(result["full"])

    def test_push_of_backend_conftest_is_backend_suite_only(self):
        self.save("backend/tests/conftest.py", "def fixture():\n    pass\n")
        result = self.push()
        self.assertEqual(result["backend_scope"], "all")
        self.assertEqual(result["backend_paths"], "")
        self.assertTrue(result["backend"])
        self.assertFalse(result["frontend"])
        self.assertFalse(result["mobile"])
        self.assertFalse(result["playwright"])
        self.assertFalse(result["full"])

    def test_deleted_backend_test_module_runs_full_backend_suite(self):
        before = self.save("backend/tests/test_removed.py", "def test_ok():\n    assert True\n")
        self.git("rm", "backend/tests/test_removed.py")
        self.git("commit", "-qm", "disposable delete")
        result = self.push(before=before)
        self.assertEqual(result["reason"], "backend-test-module-missing")
        self.assertEqual(result["backend_scope"], "all")
        self.assertTrue(result["backend"])
        self.assertFalse(result["playwright"])
        self.assertFalse(result["full"])

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

    def test_selected_backend_and_full_regression_use_different_gates(self):
        repo = Path(__file__).resolve().parents[2]
        selected = resolve_backend_modules(
            repo, classify(["backend/tests/test_bookings.py"]))
        self.assertEqual(selected["backend_scope"], "selected")
        self.assertTrue(verify(self.needs(selected)))
        self.assertFalse(verify(self.needs(selected), require_full=True))
        imported = resolve_backend_modules(
            repo, classify(["backend/tests/test_confirm_booking_created.py"]))
        self.assertEqual(imported["backend_scope"], "all")
        self.assertFalse(imported["full"])
        self.assertTrue(verify(self.needs(imported)))
        self.assertFalse(verify(self.needs(imported), require_full=True))
        self.assertTrue(verify(self.needs(full("explicit-full-event")), require_full=True))

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
