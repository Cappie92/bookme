#!/usr/bin/env python3
"""Temporary-repository regressions; generated canaries, no real credentials."""
import base64
import contextlib
import hashlib
import io
import json
import os
from pathlib import Path
import re
import random
import runpy
import secrets
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
import uuid
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))
import gitleaks_gate as gate

ROOT = Path(__file__).resolve().parents[2]
BINARY = os.environ.get("GITLEAKS_BIN", "gitleaks")


class GateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="gitleaks-regression-")
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / "repo"
        self.policy = Path(self.temp.name) / "policy"
        self.repo.mkdir()
        self.policy.mkdir()
        for name in [".gitleaks.toml", ".gitleaks-current-exceptions.json"]:
            shutil.copyfile(ROOT / name, self.policy / name)
        self.ledger = {"version": 1, "findings": []}
        self.save_ledger()
        for file in self.policy.iterdir():
            shutil.copyfile(file, self.repo / file.name)
        self.git("init", "-q", "-b", "main")
        self.git("config", "--local", "user.name", "DeDato Security Test")
        self.git("config", "--local", "user.email", "security-test@example.invalid")
        self.write("README.md", "Security gate fixture\n")
        self.base = self.commit("clean baseline")
        # Stable synthetic fixture: random hex can hit Gitleaks' dead/feed stopwords.
        rng = random.Random(0)
        self.canary = "synthetic_" + bytes(rng.getrandbits(8) for _ in range(24)).hex()

    def git(self, *args, expected_returncode=0):
        result = subprocess.run(["git", "-C", str(self.repo), *args], capture_output=True)
        self.assertEqual(result.returncode, expected_returncode, "temporary Git fixture operation failed")
        return result

    def write(self, name, text):
        file = self.repo / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(text)

    def commit(self, message):
        self.git("add", "--all")
        self.git("commit", "-q", "--allow-empty", "-m", message)
        return self.git("rev-parse", "HEAD").stdout.decode().strip()

    def secret(self, name="settings.txt"):
        self.write(name, 'api_key = "' + self.canary + '"\n')

    def save_ledger(self):
        (self.policy / ".gitleaks-history-baseline.json").write_text(json.dumps(self.ledger))

    def run_gate(self, mode="current-tree", **kwargs):
        result = gate.gate(self.repo, self.policy, BINARY, mode, **kwargs)
        self.assertFalse(self.canary in json.dumps(result), "canary leaked in metadata")
        return result

    def record_history(self, revision, classification="REVOKED_CREDENTIAL"):
        result = self.run_gate("history", head=revision)
        self.assertGreater(result["unresolved"], 0)
        for row in result["findings"]:
            self.ledger["findings"].append({
                "rule":row["rule"], "path":row["file"], "line":row["line"],
                "commit":revision, "fingerprint":row["fingerprint"],
                "blob":self.git("rev-parse", revision + ":" + row["file"]).stdout.decode().strip(),
                "classification":classification, "evidence":"Reviewed synthetic historical fixture",
            })
        self.save_ledger()

    def test_clean_commit_passes(self):
        self.assertEqual(self.run_gate()["unresolved"], 0)
        head = self.commit("clean next commit")
        self.assertEqual(self.run_gate("incremental", before=self.base, head=head)["unresolved"], 0)

    def test_new_api_secret_fails(self):
        self.secret()
        head = self.commit("synthetic secret")
        self.assertGreater(self.run_gate("incremental", before=self.base, head=head)["unresolved"], 0)

    def test_export_ignore_cannot_hide_current_tree_secret(self):
        self.secret()
        self.write(".gitattributes", "settings.txt export-ignore\n")
        self.commit("candidate export-ignore must not affect security snapshot")
        self.assertGreater(self.run_gate()["unresolved"], 0)

    def test_current_tree_secret_from_older_commit_fails(self):
        self.secret()
        older = self.commit("older synthetic secret")
        self.write("README.md", "later unrelated edit\n")
        head = self.commit("later change")
        self.assertEqual(self.run_gate("incremental", before=older, head=head)["unresolved"], 0)
        self.assertGreater(self.run_gate()["unresolved"], 0)

    def test_reviewed_history_absent_from_head_passes(self):
        self.secret()
        old = self.commit("reviewed historical canary")
        self.record_history(old)
        (self.repo / "settings.txt").unlink()
        self.commit("remove historical canary")
        self.assertEqual(self.run_gate("history")["unresolved"], 0)
        self.assertEqual(self.run_gate()["unresolved"], 0)

    def test_history_does_not_allow_current_tree(self):
        self.secret()
        self.record_history(self.commit("reviewed historical canary"))
        self.assertGreater(self.run_gate()["unresolved"], 0)

    def jwt_canary(self):
        def encode(data):
            return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
        self.canary = ".".join([
            encode(json.dumps({"alg":"HS256","typ":"JWT"}).encode()),
            encode(json.dumps({"exp":1,"synthetic":True,"nonce":secrets.token_hex(8)}).encode()),
            encode(secrets.token_bytes(32)),
        ])
        self.write("diagnostic.txt", "token = '" + self.canary + "'\n")

    def reviewed_expired_jwt(self):
        self.jwt_canary()
        old = self.commit("synthetic expired JWT")
        self.record_history(old, "EXPIRED_JWT_REMOVED")
        self.assertTrue(any(row["rule"] == "jwt" for row in self.ledger["findings"]))
        return old

    def remove_jwt(self):
        (self.repo / "diagnostic.txt").unlink()
        return self.commit("remove synthetic JWT")

    def test_expired_jwt_removed_history_passes(self):
        self.reviewed_expired_jwt()
        self.remove_jwt()
        self.assertEqual(self.run_gate("history")["unresolved"], 0)
        self.assertEqual(self.run_gate()["unresolved"], 0)

    def test_expired_jwt_baseline_cannot_allow_current_tree(self):
        self.reviewed_expired_jwt()
        self.assertGreater(self.run_gate()["unresolved"], 0)

    def test_reintroduced_expired_jwt_fails(self):
        self.reviewed_expired_jwt()
        clean = self.remove_jwt()
        self.write("diagnostic.txt", "token = '" + self.canary + "'\n")
        self.commit("reintroduce exact synthetic JWT")
        self.assertGreater(self.run_gate("incremental", before=clean)["unresolved"], 0)
        self.assertGreater(self.run_gate()["unresolved"], 0)

    def test_new_jwt_in_previously_reviewed_path_fails(self):
        self.reviewed_expired_jwt()
        clean = self.remove_jwt()
        self.jwt_canary()
        self.commit("new synthetic JWT in same path")
        result = self.run_gate("incremental", before=clean)
        self.assertTrue(any(row["rule"] == "jwt" and row["classification"] == "UNRESOLVED"
                            for row in result["findings"]))
        self.assertGreater(self.run_gate()["unresolved"], 0)

    def test_expired_jwt_baseline_requires_exact_identity(self):
        self.reviewed_expired_jwt()
        self.remove_jwt()
        originals = json.loads(json.dumps(self.ledger))
        replacements = {"commit":"0"*40,"blob":"0"*40,"line":999,"path":"other.txt",
                        "rule":"other-rule","fingerprint":"not-reviewed"}
        for field, value in replacements.items():
            with self.subTest(field=field):
                self.ledger = json.loads(json.dumps(originals))
                for row in self.ledger["findings"]:
                    row[field] = value
                self.save_ledger()
                self.assertGreater(self.run_gate("history")["unresolved"], 0)

    def test_reintroduced_old_value_fails(self):
        self.secret()
        self.record_history(self.commit("reviewed historical canary"))
        (self.repo / "settings.txt").unlink()
        clean = self.commit("remove historical canary")
        self.secret()
        head = self.commit("reintroduce same canary")
        self.assertGreater(self.run_gate("incremental", before=clean, head=head)["unresolved"], 0)

    def test_second_parent_secret_fails(self):
        self.git("checkout", "-q", "-b", "side")
        self.secret()
        self.commit("side parent canary")
        self.git("checkout", "-q", "main")
        self.git("merge", "--no-ff", "-m", "merge side", "side")
        self.assertGreater(self.run_gate("incremental", before=self.base)["unresolved"], 0)

    def test_secret_added_then_removed_inside_push_range_fails(self):
        self.secret()
        self.commit("transient canary")
        (self.repo / "settings.txt").unlink()
        self.commit("remove transient canary")
        self.assertEqual(self.run_gate()["unresolved"], 0)
        self.assertGreater(self.run_gate("incremental", before=self.base)["unresolved"], 0)

    def test_merge_resolution_secret_fails(self):
        self.write("conflict.txt", "base\n")
        base = self.commit("conflict base")
        self.git("checkout", "-q", "-b", "side")
        self.write("conflict.txt", "side\n")
        side = self.commit("side edit")
        self.git("checkout", "-q", "main")
        self.write("conflict.txt", "main\n")
        main = self.commit("main edit")
        # A content conflict is expected (1); identity/other fatal errors (128) are not.
        self.git("merge", "--no-commit", "side", expected_returncode=1)
        self.assertEqual(self.git("rev-parse", "MERGE_HEAD").stdout.decode().strip(), side)
        self.assertEqual(self.git("diff", "--name-only", "--diff-filter=U").stdout, b"conflict.txt\n")
        for parent in [main, side]:
            self.assertFalse(self.canary.encode() in self.git("show", parent + ":conflict.txt").stdout)
        self.secret("conflict.txt")
        merged = self.commit("merge resolution canary")
        parents = self.git("show", "-s", "--format=%P", "HEAD").stdout.split()
        self.assertEqual(len(parents), 2, "merge fixture must have two parents before scanning")
        self.assertEqual(parents, [main.encode(), side.encode()])
        result = self.run_gate("incremental", before=base)
        self.assertGreater(result["unresolved"], 0)
        self.assertTrue(any(row["file"] == "conflict.txt"
                            and row["fingerprint"].startswith(merged + ":")
                            and row["classification"] == "UNRESOLVED"
                            for row in result["findings"]))

    def test_storekit_low_entropy_uuid_passes(self):
        value = "00000000-0000-4000-8000-000000000001"
        self.assertEqual(uuid.UUID(value).version, 4)
        self.write("mobile/__tests__/unit/services/api/appleIapApi.test.ts",
                   "const identity = {app_account_token: '" + value + "'};\n")
        self.commit("synthetic valid StoreKit UUID")
        self.assertEqual(self.run_gate()["unresolved"], 0)

    def test_changed_storekit_fixture_fails(self):
        self.write("mobile/__tests__/unit/services/api/appleIapApi.test.ts",
                   "const identity = {app_account_token: '" + self.canary + "'};\n")
        self.commit("changed synthetic StoreKit fixture")
        self.assertGreater(self.run_gate()["unresolved"], 0)

    def checksum_file(self, header="SPEC CHECKSUMS", dependency="AppMetricaKeychain"):
        checksum = hashlib.sha1(b"synthetic CocoaPods metadata").hexdigest()
        self.write("mobile/ios/Podfile.lock", header + ":\n  " + dependency + ": " + checksum + "\n")

    def test_appmetrica_checksum_passes(self):
        self.checksum_file()
        self.commit("checksum metadata")
        result = self.run_gate()
        self.assertEqual(result["raw"], 1)
        self.assertEqual(result["suppressed_reviewed"], 1)
        self.assertEqual(result["unresolved"], 0)

    def test_unrelated_secret_in_podfile_fails(self):
        self.checksum_file()
        with (self.repo / "mobile/ios/Podfile.lock").open("a") as file:
            file.write('api_key = "' + self.canary + '"\n')
        self.commit("unrelated Podfile canary")
        self.assertGreater(self.run_gate()["unresolved"], 0)

    def test_checksum_outside_exact_context_fails(self):
        self.checksum_file(header="OTHER SECTION")
        self.commit("wrong checksum section")
        self.assertGreater(self.run_gate()["unresolved"], 0)

    def test_pr_cannot_expand_policy_to_allow_secret(self):
        self.write(".gitleaks-current-exceptions.json", json.dumps({"version":1,"exceptions":[{"rule":"generic-api-key","path":"settings.txt","classification":"FALSE_POSITIVE_BUILD_CHECKSUM"}]}))
        self.write(".gitleaks.toml", '[extend]\nuseDefault=true\n[allowlist]\npaths=[".*"]\n')
        self.secret()
        self.commit("candidate weakens policy and adds canary")
        result = self.run_gate(check_policy=True)
        self.assertTrue(any(i["classification"]=="POLICY_REVIEW_REQUIRED" for i in result["findings"]))
        self.assertTrue(any(i["classification"]=="UNRESOLVED" for i in result["findings"]))

    def test_missing_and_zero_range_fail(self):
        for before in [None,"0"*40]:
            with self.subTest(zero=bool(before)), self.assertRaises(gate.GateError):
                self.run_gate("incremental", before=before)

    def test_scanner_execution_error_fails(self):
        with self.assertRaises(gate.GateError):
            gate.gate(self.repo,self.policy,"/nonexistent/gitleaks","current-tree")

    def test_scanner_error_report_is_not_green(self):
        original = gate.execute
        def fake(args, **kwargs):
            if "detect" in args:
                path = Path(args[args.index("--report-path")+1])
                path.write_bytes(b"[]")
                return subprocess.CompletedProcess(args,0,b"",b"ERR partial scan failure")
            return original(args,**kwargs)
        with patch.object(gate,"execute",side_effect=fake), self.assertRaises(gate.GateError):
            self.run_gate()

    def test_cli_logs_never_contain_canary(self):
        self.secret()
        self.commit("CLI redaction canary")
        result=subprocess.run([sys.executable,str(ROOT/"scripts/security/gitleaks_gate.py"),
                               "--repo",str(self.repo),"--policy-dir",str(self.policy),
                               "--binary",BINARY,"--mode","current-tree"],capture_output=True)
        self.assertEqual(result.returncode,1)
        output=result.stdout+result.stderr
        self.assertFalse(self.canary.encode() in output,"canary leaked in CLI output")
        self.assertFalse(b'"Secret"' in output or b'"Match"' in output)

    def test_cli_scanner_error_does_not_forward_sensitive_stderr(self):
        original = gate.execute
        def fake(args, **kwargs):
            if "detect" in args:
                return subprocess.CompletedProcess(args, 2, self.canary.encode(),
                                                   b"ERR " + self.canary.encode())
            return original(args, **kwargs)
        output = io.StringIO()
        argv = ["gate", "--repo", str(self.repo), "--policy-dir", str(self.policy),
                "--binary", BINARY, "--mode", "current-tree"]
        with patch.object(gate, "execute", side_effect=fake), patch.object(sys, "argv", argv):
            with contextlib.redirect_stdout(output):
                result = gate.main()
        self.assertEqual(result, 2)
        self.assertFalse(self.canary in output.getvalue(), "scanner error leaked canary")
        self.assertEqual(json.loads(output.getvalue()), {"classification": "SCANNER_ERROR"})

    def test_candidate_inline_ignore_is_not_trusted(self):
        self.write("settings.txt",'api_key = "'+self.canary+'" # gitleaks:allow\n')
        self.commit("inline bypass attempt")
        self.assertGreater(self.run_gate()["unresolved"],0)

    def test_tracked_env_template_is_scanned(self):
        self.secret(".env.template")
        self.commit("tracked env example canary")
        self.assertGreater(self.run_gate()["unresolved"],0)


class DiagnosticTests(unittest.TestCase):
    def test_real_expired_jwt_entries_are_metadata_only_and_history_only(self):
        history = json.loads((ROOT / ".gitleaks-history-baseline.json").read_text())
        entries = [row for row in history["findings"] if row["classification"] == "EXPIRED_JWT_REMOVED"]
        self.assertEqual(len(entries), 2)
        self.assertEqual({row["path"] for row in entries},
                         {"backend/test_stats.py", "frontend/public/test-auth.html"})
        for row in entries:
            self.assertEqual(set(row), {"rule","path","line","commit","blob","fingerprint","classification","evidence"})
            self.assertEqual(row["rule"], "jwt")
            self.assertEqual(row["commit"], "e32dce473450a2919cb6789f456995a7f4be0e7f")
            self.assertTrue(re.fullmatch(r"[0-9a-f]{40}", row["blob"]) is not None)
            self.assertTrue(re.search(r"eyJ[\w-]+\.[\w-]+\.[\w-]+", json.dumps(row)) is None)
        current = json.loads((ROOT / ".gitleaks-current-exceptions.json").read_text())
        self.assertFalse(any(row.get("rule") == "jwt" or row.get("classification") == "EXPIRED_JWT_REMOVED"
                             for row in current["exceptions"]))

    def test_stats_missing_token_fails_before_network(self):
        requests=types.SimpleNamespace(get=unittest.mock.Mock())
        with patch.dict(sys.modules,{"requests":requests}), patch.dict(os.environ,{},clear=True):
            diagnostic=runpy.run_path(str(ROOT/"backend/test_stats.py"))
            with self.assertRaises(SystemExit),contextlib.redirect_stdout(io.StringIO()):
                diagnostic["test_stats_api"]()
            self.assertEqual(requests.get.call_count, 0)

    def test_stats_uses_only_explicit_env_token(self):
        token="synthetic_"+secrets.token_hex(16)
        response=types.SimpleNamespace(status_code=200,json=lambda:{})
        requests=types.SimpleNamespace(get=unittest.mock.Mock(return_value=response))
        output=io.StringIO()
        with patch.dict(sys.modules,{"requests":requests}),patch.dict(os.environ,{"TEST_AUTH_TOKEN":token}):
            diagnostic=runpy.run_path(str(ROOT/"backend/test_stats.py"))
            with contextlib.redirect_stdout(output):diagnostic["test_stats_api"]()
        self.assertEqual(requests.get.call_count,3)
        self.assertTrue(requests.get.call_args.kwargs["headers"]["Authorization"]=="Bearer "+token)
        self.assertFalse(token in output.getvalue(),"diagnostic printed token")

    def test_html_has_no_embedded_token_or_autofill(self):
        source=(ROOT/"frontend/public/test-auth.html").read_text()
        self.assertTrue(re.search(r"eyJ[\w-]+\.[\w-]+\.[\w-]+",source) is None)
        self.assertFalse(".value =" in source)
        self.assertFalse("token.substring" in source)

    def test_real_storekit_fixtures_remain_valid_low_entropy_uuid(self):
        for name in ["api/appleIapApi.test.ts","appleIapService.test.ts"]:
            source=(ROOT/"mobile/__tests__/unit/services"/name).read_text()
            values=re.findall(r"app_account_token: '([^']+)'",source)
            self.assertTrue(values)
            for value in values:
                self.assertTrue(value=="00000000-0000-4000-8000-000000000001")
                self.assertEqual(uuid.UUID(value).version,4)


if __name__ == "__main__":
    unittest.main()
