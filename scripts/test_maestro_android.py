"""Local harness safety contracts; no provider/device dependencies."""
import io
import socket
from pathlib import Path
import subprocess
import json
import inspect
import tempfile
import unittest
from unittest.mock import Mock, patch
import maestro_android as gate


class SafetyTests(unittest.TestCase):
    def test_observation_records_safe_os_errno_including_urlerror(self):
        for exc in (OSError(49, 'private detail must not be logged'),
                    gate.urllib.error.URLError(OSError(49, 'private detail must not be logged'))):
            def fail():
                raise exc
            result = gate.observe(fail)
            self.assertEqual(result['errno'], 49)
            self.assertEqual(result['os_error'], gate.os.strerror(49))
            self.assertNotIn('private detail', json.dumps(result))

    def diagnostic_harness(self):
        folder = tempfile.TemporaryDirectory(prefix='dedato-snapshot-unit-')
        self.addCleanup(folder.cleanup)
        h = object.__new__(gate.Harness)
        h.run_dir = Path(folder.name)
        h.processes = {'backend': Mock(pid=12345), 'metro': Mock(pid=12346)}
        for child in h.processes.values():
            child.poll.return_value = None
        h.exit_seen = set()
        h.serial = 'emulator-5554'
        h.env = {'PATH': '/bin'}
        h.flows = gate.FLOWS
        h.android_probe_supported = True
        h.listener = Mock(return_value={'present': True, 'pids': [12345]})
        h.host_tcp = Mock(return_value='connected')
        h.android_probe = Mock(return_value={'supported': True, 'healthy': True})
        h.diagnostic_command = Mock(return_value={'returncode': 0, 'stdout': 'device', 'stderr': ''})
        return h

    def cleanup_harness(self):
        h = self.diagnostic_harness()
        h.reverse_added = False
        h.handwriting_before = None
        h.children = []
        h.logs = []
        h.cleanup_errors = []
        h.adb = Mock(return_value='0\n')
        return h

    def invoke_main(self, harness, run_exc=None):
        harness.run = Mock(side_effect=run_exc) if run_exc else Mock()
        out, err = io.StringIO(), io.StringIO()
        with patch.object(gate, 'Harness', return_value=harness), \
                patch.object(gate, 'verify_repository'), \
                patch.object(gate, 'validate_inputs'), \
                patch.object(gate.signal, 'signal'), \
                patch('subprocess.check_output', side_effect=['main\n', '## main\n']), \
                patch('sys.stdout', out), patch('sys.stderr', err):
            code = gate.main()
        return code, out.getvalue(), err.getvalue()

    def test_normal_gate_does_not_start_continuous_monitor(self):
        source = Path(gate.__file__).read_text()
        self.assertNotIn('lifecycle-monitor.log', source)
        self.assertNotIn('start_monitor', source)
        self.assertNotIn('owned-lifecycle-monitor', source)
        self.assertNotIn('import threading', source)
        self.assertFalse(hasattr(gate.Harness, 'start_monitor'))
        self.assertFalse(hasattr(gate.Harness, 'monitor'))
        tests_src = inspect.getsource(gate.Harness.tests)
        self.assertNotIn('Thread', tests_src)
        self.assertNotIn('diagnostic_sample', tests_src)

    def test_failure_snapshot_is_not_a_polling_loop(self):
        source = inspect.getsource(gate.Harness.failure_snapshot)
        self.assertNotIn('while ', source)
        self.assertIn('diagnostic_sample', source)
        run_src = inspect.getsource(gate.Harness.run)
        self.assertNotIn('failure_snapshot', run_src)
        self.assertNotIn('diagnostic_sample', run_src)

    def test_no_vpn_specific_behavior(self):
        text = Path(gate.__file__).read_text().lower()
        for token in ('expressvpn', 'happ', 'xray', 'pinglocations', 'vpn'):
            self.assertNotIn(token, text)

    def test_owned_process_exit_observed_once_without_restart(self):
        h = self.diagnostic_harness()
        h.processes['backend'].poll.return_value = -15
        with patch.object(h, 'spawn') as spawn, patch('os.killpg') as kill, patch.object(gate, 'http') as http:
            row = h.diagnostic_sample()
            h.diagnostic_sample()
            self.assertEqual(row['backend']['value']['poll'], -15)
            spawn.assert_not_called()
            kill.assert_not_called()
            http.assert_not_called()
        events = [json.loads(line) for line in (h.run_dir/'process-events.jsonl').read_text().splitlines()]
        self.assertEqual(len(events), 1)
        self.assertEqual(events[0]['signal'], 15)
        self.assertEqual(events[0]['event'], 'exit_observed')

    def test_snapshot_skips_health_when_backend_has_no_listener(self):
        h = self.diagnostic_harness()
        h.listener.return_value = {'present': False, 'pids': []}
        row = h.diagnostic_sample()
        self.assertIsNone(row['backend']['value']['poll'])
        self.assertFalse(row['listener_8000']['value']['present'])
        self.assertIn('skipped', row['host_health'])
        h.host_tcp.assert_not_called()
        h.android_probe.assert_not_called()

    def test_snapshot_never_probes_replacement_listener(self):
        h = self.diagnostic_harness()
        h.listener.return_value = {'present': True, 'pids': [99999]}
        with patch.object(gate, 'http') as http:
            h.diagnostic_sample()
            http.assert_not_called()
        h.host_tcp.assert_not_called()
        h.android_probe.assert_not_called()

    def test_snapshot_records_unhealthy_host_without_retry(self):
        h = self.diagnostic_harness()
        with patch.object(gate, 'http', side_effect=gate.urllib.error.HTTPError(
                gate.BACKEND+'/health', 503, 'unhealthy', {}, None)) as http:
            row = h.diagnostic_sample()
        self.assertFalse(row['host_health']['ok'])
        self.assertEqual(row['host_health']['http_status'], 503)
        http.assert_called_once_with(gate.BACKEND+'/health', timeout=0.5)

    def test_snapshot_distinguishes_host_healthy_android_unhealthy(self):
        h = self.diagnostic_harness()
        h.android_probe.return_value = {'supported': True, 'healthy': False}
        with patch.object(gate, 'http', return_value=b'{}'):
            row = h.diagnostic_sample()
        self.assertEqual(row['host_health']['value'], 200)
        self.assertFalse(row['android_health']['value']['healthy'])

    def test_android_probe_fixed_local_tcp_target_without_payload_or_retry(self):
        h = self.diagnostic_harness()
        del h.android_probe
        h.diagnostic_command.return_value = {'returncode': 1, 'stdout': '', 'stderr': 'Connection refused'}
        result = h.android_probe()
        self.assertFalse(result['healthy'])
        args = h.diagnostic_command.call_args
        self.assertEqual(args.args[0][-2:], ['10.0.2.2', '8000'])
        self.assertIn('-z', args.args[0])
        self.assertNotIn('input', args.kwargs)
        self.assertEqual(h.diagnostic_command.call_count, 1)

    def test_android_probe_unsupported_is_not_success(self):
        h = self.diagnostic_harness()
        del h.android_probe
        h.android_probe_supported = False
        self.assertEqual(h.android_probe(), {'supported': False})
        h.diagnostic_command.assert_not_called()

    def _probe_with_run_error(self, exc):
        h = self.diagnostic_harness()
        h.diagnostic_command = gate.Harness.diagnostic_command.__get__(h, gate.Harness)
        h.detect_android_probe = gate.Harness.detect_android_probe.__get__(h, gate.Harness)
        with patch('subprocess.run', side_effect=exc):
            return h, h.detect_android_probe()

    def test_detect_android_probe_timeout_is_safe_error(self):
        h, result = self._probe_with_run_error(subprocess.TimeoutExpired(cmd=['adb'], timeout=2))
        self.assertEqual(result['status'], 'error')
        self.assertEqual(result['error_type'], 'TimeoutExpired')
        self.assertEqual(result['description'], 'timeout')
        self.assertFalse(h.android_probe_supported)
        self.assertNotIn('stdout', result)
        self.assertNotIn('output', json.dumps(result))

    def test_detect_android_probe_oserror_is_safe_error(self):
        h, result = self._probe_with_run_error(OSError(5, 'secret-adb-token'))
        self.assertEqual(result['status'], 'error')
        self.assertEqual(result['error_type'], 'OSError')
        self.assertEqual(result['errno'], 5)
        self.assertEqual(result['os_error'], gate.os.strerror(5))
        self.assertNotIn('secret-adb-token', json.dumps(result))
        self.assertFalse(h.android_probe_supported)

    def test_detect_android_probe_file_not_found_is_unavailable(self):
        h, result = self._probe_with_run_error(FileNotFoundError(2, 'adb'))
        self.assertEqual(result['status'], 'unavailable')
        self.assertEqual(result['error_type'], 'FileNotFoundError')
        self.assertFalse(h.android_probe_supported)

    def test_detect_android_probe_subprocess_error_is_safe_error(self):
        h, result = self._probe_with_run_error(subprocess.SubprocessError('spawn failed'))
        self.assertEqual(result['status'], 'error')
        self.assertEqual(result['error_type'], 'SubprocessError')
        self.assertNotIn('spawn failed', json.dumps(result))
        self.assertFalse(h.android_probe_supported)

    def test_snapshot_writes_when_android_probe_detection_fails(self):
        h = self.diagnostic_harness()
        h.diagnostic_command = gate.Harness.diagnostic_command.__get__(h, gate.Harness)
        for name in ('backend', 'app-runtime'):
            (h.run_dir/f'{name}.log').write_text('tail-line\n')
        def run_side_effect(args, **kwargs):
            if '--help' in args:
                raise subprocess.TimeoutExpired(cmd=args, timeout=2)
            return subprocess.CompletedProcess(args, 0, 'ok', '')
        with patch('subprocess.run', side_effect=run_side_effect), patch.object(gate, 'http', return_value=b'{}'):
            h.failure_snapshot()
        data = json.loads((h.run_dir/'failure-snapshot.json').read_text())
        cap = data['android_probe_capability']['value']
        self.assertEqual(cap['status'], 'error')
        self.assertEqual(cap['error_type'], 'TimeoutExpired')
        self.assertIn('listener_8081', data)
        self.assertIn('owned_ps', data)
        self.assertIn('adb_reverse', data)
        self.assertIn('backend', data)
        self.assertTrue((h.run_dir/'failure-backend-tail.log').exists())

    def test_android_probe_timeout_is_unhealthy_not_raised(self):
        h = self.diagnostic_harness()
        del h.android_probe
        h.diagnostic_command.return_value = {
            'name': 'diagnostic_command', 'status': 'error', 'error_type': 'TimeoutExpired',
            'errno': None, 'os_error': None, 'description': 'timeout',
        }
        result = h.android_probe()
        self.assertFalse(result['healthy'])
        self.assertEqual(result['status'], 'error')
        self.assertEqual(result['error_type'], 'TimeoutExpired')

    def test_later_snapshot_sections_run_after_sample_failure(self):
        h = self.diagnostic_harness()
        h.diagnostic_sample = Mock(side_effect=OSError(5, 'secret-sample-token'))
        h.failure_snapshot()
        data = json.loads((h.run_dir/'failure-snapshot.json').read_text())
        self.assertFalse(data['diagnostic_sample']['ok'])
        self.assertEqual(data['diagnostic_sample']['error_type'], 'OSError')
        self.assertNotIn('secret-sample-token', json.dumps(data))
        self.assertIn('listener_8081', data)
        self.assertIn('owned_ps', data)
        self.assertIn('adb_reverse', data)
        self.assertIn('android_probe_capability', data)

    def test_original_maestro_failure_survives_snapshot_error(self):
        h = self.diagnostic_harness()
        (h.run_dir/'app-runtime.log').write_text('login failed')
        h.failure_snapshot = Mock(side_effect=OSError(5, 'adb hung'))
        with self.assertRaisesRegex(RuntimeError, r'Maestro failed \(exit 1\)'):
            h.finish_maestro(1)

    def test_maestro_wait_timeout_keeps_original_error(self):
        h = self.diagnostic_harness()
        h.adb = Mock(side_effect=['package:ru.dedato.mobile uid:10001\n', '09-29T02:00:00.000\n'])
        proc = Mock()
        proc.wait.side_effect = subprocess.TimeoutExpired(cmd=['maestro'], timeout=900)
        h.spawn = Mock(return_value=proc)
        h._record_failure_snapshot = Mock()
        with self.assertRaises(subprocess.TimeoutExpired):
            h.tests()
        h._record_failure_snapshot.assert_called_once()

    def test_failure_snapshot_before_cleanup(self):
        h = self.diagnostic_harness()
        (h.run_dir/'app-runtime.log').write_text('ERR_NETWORK')
        calls = []
        h.failure_snapshot = Mock(side_effect=lambda: calls.append('snapshot'))
        h.cleanup = Mock(side_effect=lambda: calls.append('cleanup'))
        try:
            with self.assertRaises(RuntimeError):
                h.finish_maestro(1)
        finally:
            h.cleanup()
        self.assertEqual(calls, ['snapshot', 'cleanup'])

    def test_network_error_even_with_maestro_zero_stops_gate(self):
        h = self.diagnostic_harness()
        (h.run_dir/'app-runtime.log').write_text('ERR_NETWORK')
        h.failure_snapshot = Mock()
        with self.assertRaisesRegex(RuntimeError, 'ERR_NETWORK'):
            h.finish_maestro(0)
        h.failure_snapshot.assert_called_once()

    def test_success_does_not_write_failure_snapshot(self):
        h = self.diagnostic_harness()
        line = "I ReactNativeJS: '[ENV] Effective API_URL (axios baseURL):', 'http://10.0.2.2:8000'\n"
        (h.run_dir/'app-runtime.log').write_text(line * 5)
        h.failure_snapshot = Mock()
        h.finish_maestro(0)
        h.failure_snapshot.assert_not_called()

    def test_snapshot_has_both_ports_processes_health_and_log_tails(self):
        h = self.diagnostic_harness()
        for name in ('backend', 'app-runtime'):
            (h.run_dir/f'{name}.log').write_text('test-only\n'*120)
        with patch.object(gate, 'http', return_value=b'{}'):
            h.failure_snapshot()
        data = json.loads((h.run_dir/'failure-snapshot.json').read_text())
        self.assertIn('owned_ps', data)
        self.assertIn('listener_8081', data)
        self.assertIn('adb_reverse', data)
        self.assertEqual(len((h.run_dir/'failure-backend-tail.log').read_text().splitlines()), 100)

    def test_repository_root_is_portable_and_git_environment_is_filtered(self):
        root = Path('/portable/project')
        with patch.object(gate, 'ROOT', root), patch('pathlib.Path.home', return_value=Path('/example-home')), \
                patch.dict(gate.os.environ, {'GIT_DIR': '/unrelated/git'}), \
                patch('subprocess.check_output', return_value=str(root) + '\n') as git:
            gate.verify_repository()
            self.assertEqual(git.call_args.kwargs['cwd'], root)
            self.assertNotIn('GIT_DIR', git.call_args.kwargs['env'])
            self.assertEqual(git.call_args.args[0], ['git', 'rev-parse', '--show-toplevel'])

    def test_repository_root_must_match_git_toplevel(self):
        with patch.object(gate, 'ROOT', Path('/portable/project/nested')), \
                patch('subprocess.check_output', return_value='/portable/project\n'), \
                self.assertRaisesRegex(RuntimeError, 'Git toplevel'):
            gate.verify_repository()

    def test_known_legacy_root_invocation_and_cwd_are_refused(self):
        home = Path('/example-home')
        current, legacy = home / 'DDTO/DeDato', home / 'DeDato'
        cases = ((legacy, current / 'scripts/gate.py', current),
                 (current, legacy / 'scripts/gate.py', current),
                 (current, current / 'scripts/gate.py', legacy / 'mobile'))
        for root, script, cwd in cases:
            with self.subTest(root=root, script=script, cwd=cwd), \
                    patch.object(gate, 'ROOT', root), patch.object(gate, '__file__', str(script)), \
                    patch('pathlib.Path.home', return_value=home), patch('pathlib.Path.cwd', return_value=cwd), \
                    patch('pathlib.Path.exists', return_value=True), patch('subprocess.check_output') as git:
                with self.assertRaisesRegex(RuntimeError, 'legacy clone'):
                    gate.verify_repository()
                git.assert_not_called()

    def test_home_checkout_is_allowed_without_known_legacy_layout(self):
        root = Path('/example-home/DeDato')
        with patch.object(gate, 'ROOT', root), patch('pathlib.Path.home', return_value=root.parent), \
                patch('pathlib.Path.exists', return_value=False), \
                patch('subprocess.check_output', return_value=str(root) + '\n'):
            gate.verify_repository()

    def test_tool_prefers_first_compatible_installed_candidate(self):
        result = subprocess.CompletedProcess([], 0, 'v20.19.4\n', '')
        with patch('subprocess.run', return_value=result) as run:
            tool, _ = gate.select_tool(['/portable/bin/node', '/fallback/node'], ['--version'], r'^v20\.19\.4$', {})
            self.assertEqual(tool, Path('/portable/bin/node'))
            self.assertEqual(run.call_count, 1)

    def test_tool_skips_wrong_version_and_uses_existing_fallback(self):
        results = [subprocess.CompletedProcess([], 0, 'v22.16.0\n', ''),
                   subprocess.CompletedProcess([], 0, 'v20.19.4\n', '')]
        with patch('subprocess.run', side_effect=results):
            tool, _ = gate.select_tool(['/portable/node', '/fallback/node'], ['--version'], r'^v20\.19\.4$', {})
            self.assertEqual(tool, Path('/fallback/node'))

    def test_missing_or_incompatible_tool_fails_closed(self):
        with patch('subprocess.run', side_effect=FileNotFoundError), self.assertRaises(RuntimeError):
            gate.select_tool(['/missing/node'], ['--version'], r'^v20\.19\.4$', {})
        result = subprocess.CompletedProcess([], 0, '', 'openjdk version "21.0.1"\n')
        with patch('subprocess.run', return_value=result), self.assertRaises(RuntimeError):
            gate.select_tool(['/portable/java'], ['-version'], r'version "17\.', {})

    def test_default_inputs(self):
        gate.validate_inputs({}, gate.FLOWS)

    def test_api_targets_fail_closed(self):
        for key in ('API_URL', 'API_URL_ANDROID', 'EXPO_PUBLIC_API_URL', 'E2E_BACKEND_URL', 'WEB_URL'):
            for value in ('https://dedato.ru', 'http://localhost:8000@dedato.ru', 'http://10.0.2.2:9000'):
                with self.subTest(key=key, value=value), self.assertRaises(RuntimeError):
                    gate.validate_inputs({key: value}, gate.FLOWS)

    def test_external_db_and_opt_out_forbidden(self):
        for key in ('DATABASE_URL', 'E2E_DATABASE_PATH', 'MAESTRO_ALLOW_PRODUCTION_BACKEND', 'MAESTRO_ALLOW_EXPO_GO'):
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                gate.validate_inputs({key: 'anything'}, gate.FLOWS)

    def test_production_environment_forbidden(self):
        with self.assertRaises(RuntimeError):
            gate.validate_inputs({'ENVIRONMENT': 'PRODUCTION'}, gate.FLOWS)

    def test_only_synthetic_identity(self):
        for key in ('APP_ID', 'E2E_PHONE_DIGITS', 'E2E_PASSWORD'):
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                gate.validate_inputs({key: 'not-the-reviewed-fixture'}, gate.FLOWS)

    def test_unknown_flow_forbidden(self):
        for flow in ('../../other.yaml', '.maestro/debug/00-debug.yaml', '/tmp/flow.yaml'):
            with self.subTest(flow=flow), self.assertRaises(RuntimeError):
                gate.validate_inputs({}, [flow])

    def test_provider_and_proxy_environment_not_inherited(self):
        env = gate.local_env({'PATH': '/bin', 'HOME': '/example', 'JWT_SECRET_KEY': 'not-inherited',
                              'HTTPS_PROXY': 'http://proxy', 'DATABASE_URL': 'not-inherited'})
        for key in ('JWT_SECRET_KEY', 'HTTPS_PROXY', 'DATABASE_URL'):
            self.assertNotIn(key, env)
        self.assertEqual(env['HOME'], '/example')
        self.assertEqual(env['EXPO_NO_DOTENV'], '1')
        self.assertEqual(env['EXPO_OFFLINE'], '1')
        self.assertEqual(env['API_URL_ANDROID'], gate.API)
        self.assertEqual(env['PUSH_NOTIFICATIONS_ENABLED'], 'false')
        self.assertEqual(env['ROBOKASSA_MODE'], 'stub')

    def test_external_http_never_opened(self):
        with patch('urllib.request.build_opener') as opener:
            with self.assertRaises(RuntimeError):
                gate.http('https://dedato.ru/api/dev/e2e/seed')
            opener.assert_not_called()

    def test_runtime_api_evidence_requires_every_flow(self):
        line = "I ReactNativeJS: '[ENV] Effective API_URL (axios baseURL):', 'http://10.0.2.2:8000'\n"
        gate.verify_runtime_api(line * 5, 5)
        for log in ('', line * 4, line * 5 + line.replace(gate.API, 'https://dedato.ru')):
            with self.subTest(log_count=len(log)), self.assertRaises(RuntimeError):
                gate.verify_runtime_api(log, 5)

    def test_occupied_port_refused_without_contact(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            with self.assertRaisesRegex(RuntimeError, 'occupied'):
                gate.require_free_port(listener.getsockname()[1])

    def test_cleanup_signals_only_owned_child(self):
        harness = object.__new__(gate.Harness)
        harness.reverse_added = False
        harness.handwriting_before = None
        child = Mock(pid=12345)
        child.poll.return_value = None
        harness.children = [child]
        harness.logs = []
        harness.processes = {}
        with patch('os.killpg') as kill:
            errors = harness.cleanup()
            kill.assert_called_once_with(child.pid, gate.signal.SIGTERM)
            child.wait.assert_called_once_with(timeout=10)
            self.assertEqual(errors, [])

    def test_cleanup_restores_absent_handwriting_setting(self):
        harness = object.__new__(gate.Harness)
        harness.reverse_added = False
        harness.handwriting_before = 'null'
        harness.children = []
        harness.logs = []
        harness.processes = {}
        harness.adb = Mock(return_value='null\n')
        errors = harness.cleanup()
        self.assertEqual(harness.adb.call_count, 2)
        harness.adb.assert_any_call('shell', 'settings', 'delete', 'secure', 'stylus_handwriting_enabled')
        self.assertEqual(errors, [])

    def test_primary_failure_survives_handwriting_restore_failure(self):
        h = self.cleanup_harness()
        h.handwriting_before = 'null'
        h.adb = Mock(side_effect=OSError(5, 'secret-adb-token'))
        code, out, err = self.invoke_main(h, run_exc=RuntimeError('Maestro failed (exit 1)'))
        self.assertEqual(code, 1)
        self.assertIn('Maestro failed (exit 1)', err)
        self.assertNotIn('ANDROID MAESTRO GATE PASS', out)
        self.assertIn('restore_handwriting', err)
        data = json.loads((h.run_dir/'cleanup-errors.json').read_text())
        self.assertEqual(data['errors'][0]['action'], 'restore_handwriting')
        self.assertEqual(data['errors'][0]['error_type'], 'OSError')
        self.assertNotIn('secret-adb-token', json.dumps(data))
        self.assertLess(err.find('Maestro failed (exit 1)'), err.find('cleanup restore_handwriting'))

    def test_primary_failure_survives_adb_reverse_cleanup_failure(self):
        h = self.cleanup_harness()
        h.reverse_added = True
        child = Mock(pid=22222)
        child.poll.return_value = None
        h.children = [child]
        h.adb = Mock(side_effect=subprocess.SubprocessError('secret-reverse'))
        with patch('os.killpg') as kill:
            code, out, err = self.invoke_main(h, run_exc=RuntimeError('Maestro failed (exit 1)'))
        self.assertEqual(code, 1)
        self.assertIn('Maestro failed (exit 1)', err)
        self.assertIn('remove_adb_reverse', err)
        kill.assert_called_once_with(child.pid, gate.signal.SIGTERM)
        child.wait.assert_called_once_with(timeout=10)
        data = json.loads((h.run_dir/'cleanup-errors.json').read_text())
        self.assertEqual(data['errors'][0]['action'], 'remove_adb_reverse')
        self.assertNotIn('secret-reverse', json.dumps(data))

    def test_success_becomes_fail_when_cleanup_fails(self):
        h = self.cleanup_harness()
        h.handwriting_before = '0'
        h.adb = Mock(return_value='1\n')
        code, out, err = self.invoke_main(h)
        self.assertEqual(code, 1)
        self.assertNotIn('ANDROID MAESTRO GATE PASS', out)
        self.assertIn('restore_handwriting', err)
        data = json.loads((h.run_dir/'cleanup-errors.json').read_text())
        self.assertEqual(data['errors'][0]['description'], 'restore_mismatch')

    def test_success_and_cleanup_success_is_pass(self):
        h = self.cleanup_harness()
        code, out, err = self.invoke_main(h)
        self.assertEqual(code, 0)
        self.assertIn('ANDROID MAESTRO GATE PASS', out)
        self.assertEqual(err, '')
        self.assertFalse((h.run_dir/'cleanup-errors.json').exists())

    def test_one_child_cleanup_failure_still_stops_later_owned_child(self):
        h = self.cleanup_harness()
        first, second = Mock(pid=111), Mock(pid=222)
        first.poll.return_value = None
        second.poll.return_value = None
        h.children = [first, second]
        def killpg(pid, sig):
            if pid == 222:
                raise OSError(5, 'secret-child')
        with patch('os.killpg', side_effect=killpg) as kill:
            errors = h.cleanup()
        self.assertTrue(any(c.args == (111, gate.signal.SIGTERM) for c in kill.call_args_list))
        self.assertEqual(errors[0]['action'], 'terminate_child')
        self.assertEqual(errors[0]['error_type'], 'OSError')
        self.assertNotIn('secret-child', json.dumps(errors))
        first.wait.assert_called_once_with(timeout=10)

    def test_killpg_process_lookup_does_not_mask_primary_or_stop_cleanup(self):
        h = self.cleanup_harness()
        child = Mock(pid=12345)
        child.poll.return_value = None
        h.children = [child]
        with patch('os.killpg', side_effect=ProcessLookupError):
            code, out, err = self.invoke_main(h, run_exc=RuntimeError('Maestro failed (exit 1)'))
        self.assertEqual(code, 1)
        self.assertIn('Maestro failed (exit 1)', err)
        self.assertNotIn('ANDROID MAESTRO GATE PASS', out)
        self.assertFalse((h.run_dir/'cleanup-errors.json').exists())

    def test_killpg_oserror_does_not_mask_primary(self):
        h = self.cleanup_harness()
        child = Mock(pid=12345)
        child.poll.return_value = None
        h.children = [child]
        with patch('os.killpg', side_effect=OSError(5, 'secret-kill')):
            code, out, err = self.invoke_main(h, run_exc=RuntimeError('Maestro failed (exit 1)'))
        self.assertEqual(code, 1)
        self.assertIn('Maestro failed (exit 1)', err)
        self.assertIn('terminate_child', err)
        self.assertNotIn('secret-kill', err)
        self.assertLess(err.find('Maestro failed (exit 1)'), err.find('terminate_child'))

    def test_wait_timeout_sigkill_only_owned_then_continues(self):
        h = self.cleanup_harness()
        timed_out, later = Mock(pid=111), Mock(pid=222)
        timed_out.poll.return_value = None
        later.poll.return_value = None
        timed_out.wait.side_effect = [subprocess.TimeoutExpired(cmd=['owned'], timeout=10), None]
        h.children = [timed_out, later]
        with patch('os.killpg') as kill:
            errors = h.cleanup()
        self.assertEqual(errors, [])
        self.assertEqual([c.args for c in kill.call_args_list], [
            (222, gate.signal.SIGTERM),
            (111, gate.signal.SIGTERM),
            (111, gate.signal.SIGKILL),
        ])
        later.wait.assert_called_once_with(timeout=10)
        timed_out.wait.assert_any_call(timeout=10)
        timed_out.wait.assert_any_call(timeout=5)

    def test_handwriting_restore_failure_blocks_success_path(self):
        h = self.cleanup_harness()
        h.handwriting_before = 'null'
        h.adb = Mock(side_effect=OSError(5, 'secret-restore'))
        errors = h.cleanup()
        self.assertEqual(errors[0]['action'], 'restore_handwriting')
        h2 = self.cleanup_harness()
        h2.handwriting_before = 'null'
        h2.adb = Mock(side_effect=OSError(5, 'secret-restore'))
        code, out, err = self.invoke_main(h2)
        self.assertEqual(code, 1)
        self.assertNotIn('ANDROID MAESTRO GATE PASS', out)
        self.assertIn('restore_handwriting', err)

    def test_unhandled_cleanup_exception_does_not_replace_primary(self):
        h = self.cleanup_harness()
        h.cleanup = Mock(side_effect=RuntimeError('handwriting restore failed'))
        code, out, err = self.invoke_main(h, run_exc=RuntimeError('Maestro failed (exit 1)'))
        self.assertEqual(code, 1)
        self.assertIn('Maestro failed (exit 1)', err)
        self.assertLess(err.find('Maestro failed (exit 1)'), err.find('ERROR: cleanup'))
        self.assertNotIn('ANDROID MAESTRO GATE PASS', out)

    def test_all_flows_bootstrap_before_assertions(self):
        for flow in gate.FLOWS:
            text = (gate.MOBILE / flow).read_text()
            self.assertEqual(text.count('- runFlow: ../shared/launch-local.yaml'), 1)
            self.assertNotIn('- launchApp:', text)
        helper = (gate.MOBILE / '.maestro/shared/launch-local.yaml').read_text()
        self.assertLess(helper.index('clearState: true'), helper.index('openLink:'))
        self.assertIn('id: "welcome-nav-auth"', helper)

    def test_probe_selector_changes_removed(self):
        for path in ('shared/login-master.yaml', 'flows/02-login-error.yaml', 'flows/05-logout.yaml'):
            text = (gate.MOBILE / '.maestro' / path).read_text()
            self.assertNotIn('text: "Вход"', text)
            self.assertIn('id: "welcome-nav-auth"', text)

    def test_login_hides_keyboard_before_submit(self):
        for path in ('shared/login-master.yaml', 'flows/02-login-error.yaml'):
            text = (gate.MOBILE / '.maestro' / path).read_text()
            self.assertEqual(text.count('- hideKeyboard'), 2)
            self.assertIn('- hideKeyboard\n- tapOn:\n    id: "login-button"', text)

    def test_login_error_asserts_alert_then_dismisses_before_screen_checks(self):
        text = (gate.MOBILE / '.maestro/flows/02-login-error.yaml').read_text()
        self.assertLess(text.index('text: "Ошибка входа"'), text.index('text: "OK"'))
        self.assertLess(text.index('text: "OK"'), text.index('id: "login-tab"'))
        self.assertIn('id: "login-screen-title"', text)

    def test_bootstrap_dismisses_only_known_debug_warning(self):
        text = (gate.MOBILE / '.maestro/shared/launch-local.yaml').read_text()
        self.assertIn('rightOf:', text)
        self.assertIn('childOf:', text)
        self.assertIn('assertNotVisible:', text)
        self.assertNotIn('optional:', text)
        self.assertNotIn('ignore', text)


if __name__ == '__main__':
    unittest.main()
