"""Local iOS Maestro harness safety contracts; no provider/device dependencies."""
import io
import inspect
import json
import plistlib
import socket
import subprocess
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import Mock, patch

import maestro_ios as gate


class IosSafetyTests(unittest.TestCase):
    def diagnostic_harness(self):
        folder = tempfile.TemporaryDirectory(prefix='dedato-ios-unit-')
        self.addCleanup(folder.cleanup)
        h = object.__new__(gate.Harness)
        h.run_dir = Path(folder.name)
        h.processes = {'backend': Mock(pid=12345), 'metro': Mock(pid=12346)}
        for child in h.processes.values():
            child.poll.return_value = None
        h.exit_seen = set()
        h.env = {'PATH': '/bin'}
        h.flows = gate.FLOWS
        h.children = []
        h.logs = []
        h.cleanup_errors = []
        h.udid = 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'
        h.owned_udid = h.udid
        h.owned_name = 'DeDato-Maestro-unit'
        h.runtime_id = 'com.apple.CoreSimulator.SimRuntime.iOS-26-3'
        h.device_type_id = 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro'
        h.app = h.run_dir / 'Debug-iphonesimulator' / 'DeDato.app'
        h.app.mkdir(parents=True)
        h.current_flow = None
        return h

    def simctl_boundary(self, h, failures=None, installed=True, devices=None, ps_stdout=None):
        """Fake only external subprocess results; runner parsing/reset remain real."""
        failures = failures or {}
        apps = {gate.APP_ID: {}} if installed else {}
        record = {'udid': h.owned_udid, 'name': h.owned_name,
                  'isAvailable': True, 'state': 'Booted'}
        payload = devices if devices is not None else {'devices': {'runtime': [record]}}
        actions = []

        def run(args, **kwargs):
            if args[0] == '/usr/bin/plutil':
                converted = plistlib.loads(kwargs['input'].encode())
                return subprocess.CompletedProcess(args, 0, json.dumps(converted), '')
            if args[:2] != ['xcrun', 'simctl']:
                return subprocess.CompletedProcess(args, 0, '', '')
            action = args[2]
            actions.append(action)
            if action == 'list':
                return subprocess.CompletedProcess(args, 0, json.dumps(payload), '')
            if action == 'listapps':
                return subprocess.CompletedProcess(args, 0, plistlib.dumps(apps).decode(), '')
            if action == 'spawn' and 'ps' in args:
                body = ps_stdout() if ps_stdout else '4242 DeDato\n'
                if isinstance(body, tuple):
                    return subprocess.CompletedProcess(args, body[0], body[1], '')
                return subprocess.CompletedProcess(args, 0, body, '')
            rc, stderr = failures.get(action, (0, ''))
            if rc == 0:
                if action == 'uninstall':
                    apps.pop(gate.APP_ID, None)
                elif action == 'install':
                    apps[gate.APP_ID] = {}
                elif action == 'shutdown':
                    record['state'] = 'Shutdown'
            return subprocess.CompletedProcess(args, rc, '', stderr)
        return run, actions

    def format_runtime_emission(self, h, text):
        if text.strip().startswith('{'):
            return text if text.endswith('\n') else text + '\n'
        wall = getattr(h, 'current_launch_wall', None) or datetime.now(timezone.utc)
        message = text.strip()
        if 'Effective API_URL' not in message:
            message = f"I ReactNativeJS: '[ENV] Effective API_URL (axios baseURL):', '{gate.API}'"
        record = {
            'timestamp': (wall + timedelta(seconds=1)).isoformat(),
            'processID': 4242,
            'eventMessage': message,
        }
        return json.dumps(record) + '\n'

    def exercise_flows(self, h, emissions, initial='', metro='', maestro_code=0, ps_stdout=None):
        """Run real tests/reset/run_one/finish; only process boundaries are mocked."""
        (h.run_dir / 'app-runtime.log').write_text(initial)
        (h.run_dir / 'metro.log').write_text(metro)
        boundary, actions = self.simctl_boundary(h, ps_stdout=ps_stdout)
        launched = []

        def popen(args, **kwargs):
            proc = Mock(pid=12347 + len(launched))
            proc.poll.return_value = None
            if args[0] == 'maestro':
                flow = args[-1]
                launched.append(flow)
                actions.append('maestro')
                def wait(timeout):
                    payload = emissions.get(flow, '')
                    if payload:
                        with (h.run_dir / 'app-runtime.log').open('a') as log:
                            log.write(self.format_runtime_emission(h, payload))
                    return maestro_code
                proc.wait.side_effect = wait
            else:
                kwargs['stdout'].write(initial)
                kwargs['stdout'].flush()
            return proc

        try:
            with patch('subprocess.run', side_effect=boundary), patch('subprocess.Popen', side_effect=popen):
                h.tests()
        finally:
            for log in h.logs:
                log.close()
        return launched, actions

    def invoke_main(self, harness, run_exc=None, run_action=None):
        harness.run = run_action if run_action else (Mock(side_effect=run_exc) if run_exc else Mock())
        out, err = io.StringIO(), io.StringIO()
        with patch.object(gate, 'Harness', return_value=harness), \
                patch.object(gate, 'verify_repository'), \
                patch.object(gate, 'validate_inputs'), \
                patch.object(gate.signal, 'signal'), \
                patch('subprocess.check_output', side_effect=['main\n', '## main\n']), \
                patch('sys.stdout', out), patch('sys.stderr', err):
            code = gate.main()
        return code, out.getvalue(), err.getvalue()

    def test_repository_root_is_portable_and_git_environment_is_filtered(self):
        root = Path('/portable/project')
        with patch.object(gate, 'ROOT', root), patch('pathlib.Path.home', return_value=Path('/example-home')), \
                patch.dict(gate.os.environ, {'GIT_DIR': '/unrelated/git'}), \
                patch('subprocess.check_output', return_value=str(root) + '\n') as git:
            gate.verify_repository()
            self.assertEqual(git.call_args.kwargs['cwd'], root)
            self.assertNotIn('GIT_DIR', git.call_args.kwargs['env'])

    def test_canonical_flow_allowlist_and_order(self):
        self.assertEqual(gate.FLOWS, [
            '.maestro/flows/01-login-success.yaml',
            '.maestro/flows/02-login-error.yaml',
            '.maestro/flows/03-navigate-to-bookings.yaml',
            '.maestro/flows/04-open-booking-details.yaml',
            '.maestro/flows/05-logout.yaml',
        ])
        gate.validate_inputs({}, gate.FLOWS)
        gate.validate_inputs({}, [gate.FLOWS[0]])

    def test_unknown_flow_rejected(self):
        for flow in ('../../other.yaml', '.maestro/debug/00-debug.yaml', '/tmp/flow.yaml'):
            with self.subTest(flow=flow), self.assertRaises(RuntimeError):
                gate.validate_inputs({}, [flow])

    def test_no_runtime_fails_closed(self):
        with self.assertRaisesRegex(RuntimeError, 'No compatible iOS Simulator runtime'):
            gate.available_ios_runtimes({'runtimes': []})
        with self.assertRaisesRegex(RuntimeError, 'No compatible iOS Simulator runtime'):
            gate.available_ios_runtimes({'runtimes': [{
                'name': 'iOS 26.3', 'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-26-3',
                'isAvailable': False, 'version': '26.3',
            }]})

    def test_runtime_selection_prefers_available_newest_ios(self):
        selected = gate.available_ios_runtimes({'runtimes': [
            {'name': 'iOS 18.5', 'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-18-5',
             'isAvailable': True, 'version': '18.5'},
            {'name': 'iOS 26.3', 'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-26-3',
             'isAvailable': True, 'version': '26.3.1'},
            {'name': 'watchOS 11.0', 'identifier': 'com.apple.CoreSimulator.SimRuntime.watchOS-11-0',
             'isAvailable': True, 'version': '11.0'},
        ]})
        self.assertEqual(selected[0]['identifier'], 'com.apple.CoreSimulator.SimRuntime.iOS-26-3')

    def test_iphone_device_type_selection_skips_ipad(self):
        types = gate.available_iphone_devicetypes({'devicetypes': [
            {'name': 'iPad Pro 13-inch', 'identifier': 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13'},
            {'name': 'iPhone 16', 'identifier': 'com.apple.CoreSimulator.SimDeviceType.iPhone-16'},
            {'name': 'iPhone 17 Pro', 'identifier': 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro'},
        ]})
        self.assertEqual(types[0]['name'], 'iPhone 17 Pro')
        self.assertTrue(all('iPad' not in item['name'] for item in types))

    def test_local_only_urls_and_android_host_rejected(self):
        self.assertEqual(gate.API, 'http://127.0.0.1:8000')
        self.assertEqual(gate.METRO, 'http://127.0.0.1:8081')
        self.assertNotIn('10.0.2.2', gate.API)
        for key in ('API_URL', 'API_URL_ANDROID', 'E2E_BACKEND_URL'):
            with self.subTest(key=key), self.assertRaises(RuntimeError):
                gate.validate_inputs({key: 'http://10.0.2.2:8000'}, gate.FLOWS)
            with self.subTest(prod=key), self.assertRaises(RuntimeError):
                gate.validate_inputs({key: 'https://dedato.ru'}, gate.FLOWS)

    def test_disposable_db_path_and_no_listener_reuse(self):
        env = gate.local_env({'PATH': '/bin', 'HOME': '/example', 'DATABASE_URL': 'not-inherited'})
        self.assertNotIn('DATABASE_URL', env)
        self.assertEqual(env['API_URL'], gate.API)
        self.assertEqual(env['WEB_URL'], gate.WEB)
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            with self.assertRaisesRegex(RuntimeError, 'occupied'):
                gate.require_free_port(listener.getsockname()[1])

    def test_external_http_never_opened(self):
        with patch('urllib.request.build_opener') as opener:
            with self.assertRaises(RuntimeError):
                gate.http('https://dedato.ru/api/dev/e2e/seed')
            opener.assert_not_called()

    def test_provider_secrets_not_inherited(self):
        env = gate.local_env({'PATH': '/bin', 'HOME': '/example', 'JWT_SECRET_KEY': 'secret',
                              'HTTPS_PROXY': 'http://proxy', 'DATABASE_URL': 'not-inherited'})
        for key in ('JWT_SECRET_KEY', 'HTTPS_PROXY', 'DATABASE_URL'):
            self.assertNotIn(key, env)

    def test_owned_simulator_required_before_destructive_reset(self):
        h = self.diagnostic_harness()
        h.owned_udid = None
        h.simctl = Mock()
        with self.assertRaisesRegex(RuntimeError, 'No owned simulator'):
            h.reset_owned_session()
        h.simctl.assert_not_called()

    def test_never_keychain_reset_or_delete_arbitrary_simulator(self):
        h = self.diagnostic_harness()
        h.udid = 'FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF'
        h.simctl_json = Mock(return_value={'devices': {'iOS 26.3': [{
            'udid': h.udid, 'name': 'iPhone 17 Pro', 'isAvailable': True,
        }]}})
        h.simctl = Mock()
        with self.assertRaisesRegex(RuntimeError, 'not the owned'):
            h.require_owned_simulator()
        with self.assertRaises(RuntimeError):
            h.reset_owned_session()
        self.assertFalse(any(c.args and c.args[0] == 'keychain' for c in h.simctl.call_args_list))
        h._cleanup_owned_simulator()
        self.assertFalse(any(c.args and c.args[0] == 'delete' for c in h.simctl.call_args_list))

    def test_owned_identity_allows_reset_and_records_order(self):
        h = self.diagnostic_harness()
        boundary, actions = self.simctl_boundary(h)
        with patch('subprocess.run', side_effect=boundary) as run:
            h.reset_owned_session()
        self.assertEqual([a for a in actions if a not in ('list', 'listapps')],
                         ['terminate', 'keychain', 'uninstall', 'install'])
        self.assertIn(['xcrun', 'simctl', 'keychain', h.owned_udid, 'reset'],
                      [c.args[0] for c in run.call_args_list])
        self.assertIn(['xcrun', 'simctl', 'install', h.owned_udid, str(h.app)],
                      [c.args[0] for c in run.call_args_list])

    def test_cleanup_deletes_only_owned_simulator(self):
        h = self.diagnostic_harness()
        boundary, actions = self.simctl_boundary(h)
        owned = h.owned_udid
        with patch('subprocess.run', side_effect=boundary) as run:
            h._cleanup_owned_simulator()
        self.assertIn('shutdown', actions)
        self.assertIn('delete', actions)
        delete = [c for c in run.call_args_list if c.args[0][:3] == ['xcrun', 'simctl', 'delete']]
        self.assertEqual(delete[0].args[0][3], owned)
        self.assertIsNone(h.owned_udid)

    def test_validate_app_requires_debug_simulator_bundle(self):
        h = self.diagnostic_harness()
        plist = {
            'CFBundleIdentifier': 'com.dedato.app',
            'DTPlatformName': 'iphonesimulator',
            'DTSDKName': 'iphonesimulator26.3',
        }
        (h.app / 'Info.plist').write_bytes(plistlib.dumps(plist))
        self.assertEqual(h.validate_app(h.app)['CFBundleIdentifier'], gate.APP_ID)
        device = plist | {'DTPlatformName': 'iphoneos'}
        (h.app / 'Info.plist').write_bytes(plistlib.dumps(device))
        with self.assertRaisesRegex(RuntimeError, 'device/iphoneos'):
            h.validate_app(h.app)

    def test_build_uses_generic_simulator_destination_without_eas(self):
        source = Path(gate.__file__).read_text()
        self.assertIn("generic/platform=iOS Simulator", source)
        self.assertIn('CODE_SIGNING_ALLOWED=NO', source)
        self.assertNotIn('expo run:ios', source)
        self.assertNotIn('eas build', source.lower())
        self.assertNotIn('TestFlight', source)

    def test_per_flow_reset_before_each_maestro_invocation(self):
        h = self.diagnostic_harness()
        h.flows = gate.FLOWS
        line = "Effective API_URL (axios baseURL): http://127.0.0.1:8000\n"
        launched, actions = self.exercise_flows(h, {f: line for f in gate.FLOWS})
        self.assertEqual(launched, gate.FLOWS)
        self.assertEqual(actions.count('keychain'), 5)
        self.assertEqual(actions.count('uninstall'), 5)
        self.assertEqual(actions.count('install'), 5)
        self.assertEqual([a for a in actions if a in
                          ('terminate', 'keychain', 'uninstall', 'install', 'maestro')],
                         ['terminate', 'keychain', 'uninstall', 'install', 'maestro'] * 5)

    def test_launch_local_opens_dev_client_on_ios_without_dropping_android(self):
        text = (gate.MOBILE / '.maestro/shared/launch-local.yaml').read_text()
        ios = text.split('platform: iOS', 1)[1].split('extendedWaitUntil:', 1)[0]
        android = text.split('platform: Android', 1)[1].split('platform: iOS', 1)[0]
        self.assertIn('platform: Android', text)
        self.assertIn('openLink: "${DEVELOPMENT_CLIENT_URL}"', android)
        self.assertNotIn('Открыть', android)
        self.assertNotIn('^Open$', android)
        self.assertIn('openLink: "${DEVELOPMENT_CLIENT_URL}"', ios)
        self.assertEqual(text.count('openLink: "${DEVELOPMENT_CLIENT_URL}"'), 2)
        self.assertIn('id: "welcome-nav-auth"', text)
        self.assertLess(text.index('platform: iOS'), text.index('id: "welcome-nav-auth"'))
        self.assertLess(ios.index('openLink:'), ios.index('text: "^Открыть$"'))
        self.assertLess(ios.index('text: "^Открыть$"'), ios.index('text: "^Open$"'))
        self.assertEqual(ios.count('when:\n            visible:'), 2)
        self.assertNotIn('Отменить', text)
        self.assertNotIn('Cancel', ios)
        self.assertNotIn('optional:', text)
        self.assertNotIn('point:', text)
        self.assertNotIn('index:', text)
        self.assertLess(text.index('clearState: true'), text.index('platform: iOS'))

    def test_ios_login_submit_is_a_single_button_tap(self):
        text = (gate.MOBILE / '.maestro/shared/login-master.yaml').read_text()
        self.assertNotIn('platform: iOS', text)
        self.assertNotIn('enabled:', text)
        self.assertEqual(text.count('id: "login-button"'), 1)
        self.assertEqual(text.count('- hideKeyboard'), 2)
        self.assertIn('- hideKeyboard\n- tapOn:\n    id: "login-button"\n', text)
        self.assertLess(text.index('id: "login-button"'), text.index('push-permission-education-dismiss'))
        self.assertNotIn('point:', text)
        self.assertNotIn('index:', text)
        self.assertNotIn('text: "Войти"', text)

    def test_focused_mode_runs_one_known_flow(self):
        h = self.diagnostic_harness()
        h.flows = [gate.FLOWS[0]]
        line = "Effective API_URL (axios baseURL): http://127.0.0.1:8000\n"
        launched, actions = self.exercise_flows(h, {gate.FLOWS[0]: line})
        self.assertEqual(launched, [gate.FLOWS[0]])
        self.assertEqual(actions.count('keychain'), 1)

    def test_primary_failure_survives_snapshot_error(self):
        h = self.diagnostic_harness()
        (h.run_dir / 'app-runtime.log').write_text('login failed')
        h.failure_snapshot = Mock(side_effect=OSError(5, 'simctl hung'))
        with self.assertRaisesRegex(RuntimeError, r'Maestro failed \(exit 1\)'):
            h.finish_maestro(1)

    def test_primary_failure_survives_cleanup_failure(self):
        h = self.diagnostic_harness()
        h.cleanup = Mock(side_effect=RuntimeError('delete failed'))
        code, out, err = self.invoke_main(h, run_exc=RuntimeError('Maestro failed (exit 1)'))
        self.assertEqual(code, 1)
        self.assertIn('Maestro failed (exit 1)', err)
        self.assertLess(err.find('Maestro failed (exit 1)'), err.find('ERROR: cleanup'))
        self.assertNotIn('IOS MAESTRO GATE PASS', out)

    def test_success_plus_cleanup_failure_is_fail(self):
        h = self.diagnostic_harness()
        h.cleanup = Mock(return_value=[{'action': 'delete_owned_simulator', 'error_type': 'OSError',
                                        'description': 'error'}])
        code, out, err = self.invoke_main(h)
        self.assertEqual(code, 1)
        self.assertNotIn('IOS MAESTRO GATE PASS', out)
        self.assertIn('delete_owned_simulator', err)

    def test_success_and_cleanup_success_is_pass(self):
        h = self.diagnostic_harness()
        h.cleanup = Mock(return_value=[])
        code, out, err = self.invoke_main(h)
        self.assertEqual(code, 0)
        self.assertIn('IOS MAESTRO GATE PASS', out)
        self.assertEqual(err, '')

    def test_cleanup_signals_only_owned_child(self):
        h = self.diagnostic_harness()
        h.owned_udid = None
        child = Mock(pid=12345)
        child.poll.return_value = None
        h.children = [child]
        h.processes = {}
        with patch('os.killpg') as kill:
            errors = h.cleanup()
            kill.assert_called_once_with(child.pid, gate.signal.SIGTERM)
            child.wait.assert_called_once_with(timeout=10)
            self.assertEqual(errors, [])

    def test_process_lookup_on_killpg_is_not_blocking(self):
        h = self.diagnostic_harness()
        h.owned_udid = None
        child = Mock(pid=12345)
        child.poll.return_value = None
        h.children = [child]
        with patch('os.killpg', side_effect=ProcessLookupError):
            errors = h.cleanup()
        self.assertEqual(errors, [])

    def test_wrapper_dispatches_ios_and_keeps_android(self):
        text = (gate.ROOT / 'scripts/run-maestro-e2e.sh').read_text()
        android_at = text.index('exec python3 "$ROOT/scripts/maestro_android.py"')
        ios_at = text.index('exec python3 "$ROOT/scripts/maestro_ios.py"')
        self.assertLess(android_at, ios_at)
        self.assertIn('android)', text)

    def test_no_personal_path_or_secret_logging(self):
        source = Path(gate.__file__).read_text()
        self.assertNotIn('/Users/s.', source)
        self.assertNotIn('JWT_SECRET', source)
        self.assertNotIn('lifecycle-monitor.log', source)
        self.assertNotIn('import threading', source)
        self.assertNotIn('while True', source)
        for token in ('expressvpn', 'happ', 'xray', 'vpn'):
            self.assertNotIn(token, source.lower())

    def test_physical_device_and_store_paths_absent(self):
        source = Path(gate.__file__).read_text()
        self.assertIn("generic/platform=iOS Simulator", source)
        self.assertIn('never using a physical device', source)
        self.assertNotIn('idevice_id', source)
        self.assertNotIn('eas.json', source)

    def test_occupied_port_does_not_kill(self):
        source = inspect.getsource(gate.require_free_port)
        self.assertIn('No process was killed', source)

    def test_runtime_api_evidence_is_loopback(self):
        wall = datetime(2026, 1, 1, tzinfo=timezone.utc)
        line = json.dumps({
            'timestamp': '2026-01-01T00:00:01+00:00',
            'processID': 4242,
            'eventMessage': "I ReactNativeJS: '[ENV] Effective API_URL (axios baseURL):', 'http://127.0.0.1:8000'",
        }) + '\n'
        gate.verify_ios_per_flow_api_evidence(line.encode(), 4242, wall)
        bad = line.replace(gate.API, 'http://10.0.2.2:8000').encode()
        with self.assertRaises(RuntimeError):
            gate.verify_ios_per_flow_api_evidence(bad, 4242, wall)

    def test_snapshot_is_one_shot_not_poller(self):
        source = inspect.getsource(gate.Harness.failure_snapshot)
        self.assertNotIn('while ', source)
        tests_src = inspect.getsource(gate.Harness.tests)
        self.assertNotIn('Thread', tests_src)

    def test_success_does_not_write_failure_snapshot(self):
        h = self.diagnostic_harness()
        line = "I ReactNativeJS: '[ENV] Effective API_URL (axios baseURL):', 'http://127.0.0.1:8000'\n"
        (h.run_dir / 'app-runtime.log').write_text(line * 5)
        h.failure_snapshot = Mock()
        h.finish_maestro(0)
        h.failure_snapshot.assert_not_called()

    def test_create_simulator_records_owned_identity(self):
        h = self.diagnostic_harness()
        h.simctl_json = Mock(side_effect=[
            {'runtimes': [{'name': 'iOS 26.3', 'identifier': 'com.apple.CoreSimulator.SimRuntime.iOS-26-3',
                           'isAvailable': True, 'version': '26.3'}]},
            {'devicetypes': [{'name': 'iPhone 17 Pro',
                              'identifier': 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro'}]},
        ])
        h.simctl = Mock(return_value='AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE\n')
        h.create_owned_simulator()
        self.assertEqual(h.owned_udid, 'AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')
        self.assertTrue(h.owned_name.startswith(gate.OWNED_SIM_PREFIX))
        self.assertEqual(h.simctl.call_args.args[0], 'create')
        self.assertEqual(h.simctl.call_args.args[1], h.owned_name)

    def test_cleanup_identity_failures_still_clean_children_and_logs(self):
        failures = [subprocess.TimeoutExpired('simctl', 120), OSError(5, 'private detail'),
                    ValueError('private parser detail'), 'not-json', '{"devices": []}']
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                h = self.diagnostic_harness()
                children = [Mock(pid=201), Mock(pid=202)]
                for child in children:
                    child.poll.return_value = None
                h.children = children
                log = Mock()
                h.logs = [log]
                def run(args, **kwargs):
                    if isinstance(failure, Exception):
                        raise failure
                    return subprocess.CompletedProcess(args, 0, failure, '')
                with patch('subprocess.run', side_effect=run) as run_mock, patch('os.killpg') as kill:
                    errors = h.cleanup()
                self.assertEqual(kill.call_count, 2)
                for child in children:
                    child.wait.assert_called_once_with(timeout=10)
                log.close.assert_called_once()
                self.assertEqual(errors[0]['action'], 'identify_owned_simulator')
                self.assertNotIn('private', json.dumps(errors))
                self.assertFalse(any(c.args[0][2] in ('keychain', 'delete', 'shutdown')
                                     for c in run_mock.call_args_list))

    def test_malformed_json_in_main_still_cleans_up_and_keeps_primary(self):
        h = self.diagnostic_harness()
        h.run = lambda: h.simctl_json('list', 'devices')
        child = Mock(pid=203)
        child.poll.return_value = None
        h.children = [child]
        log = Mock()
        h.logs = [log]
        out, err = io.StringIO(), io.StringIO()
        with patch.object(gate, 'Harness', return_value=h), patch.object(gate, 'verify_repository'), \
                patch.object(gate, 'validate_inputs'), patch.object(gate.signal, 'signal'), \
                patch('subprocess.check_output', side_effect=['main\n', '## main\n']), \
                patch('subprocess.run', return_value=subprocess.CompletedProcess([], 0, 'not-json', '')), \
                patch('os.killpg') as kill, patch('sys.stdout', out), patch('sys.stderr', err):
            code = gate.main()
        self.assertEqual(code, 1)
        self.assertIn('Malformed simctl JSON', err.getvalue())
        self.assertLess(err.getvalue().index('Malformed simctl JSON'), err.getvalue().index('ERROR: cleanup'))
        kill.assert_called_once_with(203, gate.signal.SIGTERM)
        log.close.assert_called_once()
        self.assertNotIn('IOS MAESTRO GATE PASS', out.getvalue())

    def test_identity_payloads_fail_closed_before_reset(self):
        h = self.diagnostic_harness()
        valid = {'udid': h.owned_udid, 'name': h.owned_name, 'isAvailable': True, 'state': 'Booted'}
        bad_records = [
            [], [valid, dict(valid)], [valid, dict(valid, udid=h.owned_udid.lower())],
            [valid, dict(valid, name='conflicting')],
            [{k: v for k, v in valid.items() if k != 'isAvailable'}],
            [{k: v for k, v in valid.items() if k != 'state'}],
            [dict(valid, isAvailable='true')], [dict(valid, isAvailable=False)],
            [dict(valid, state='unknown')], [dict(valid, name='DeDato-Maestro-someone-else')],
            [dict(valid, udid='FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF')],
        ]
        payloads = [{'devices': {'runtime': records}} for records in bad_records]
        payloads += [{}, {'devices': []}, {'devices': {'runtime': {}}},
                     {'devices': {'runtime': [None]}}, {'devices': {'runtime': [{'name': 'missing-id'}]}}]
        for payload in payloads:
            with self.subTest(payload=payload):
                boundary, actions = self.simctl_boundary(h, devices=payload)
                with patch('subprocess.run', side_effect=boundary), self.assertRaises(RuntimeError):
                    h.reset_owned_session()
                self.assertEqual(actions, ['list'])

    def test_malformed_create_output_never_becomes_owned_target(self):
        h = self.diagnostic_harness()
        h.owned_udid = h.udid = h.owned_name = None
        def run(args, **kwargs):
            if args[2:4] == ['list', 'runtimes']:
                data = {'runtimes': [{'name': 'iOS 99', 'identifier': 'runtime',
                                      'isAvailable': True, 'version': '99'}]}
            elif args[2:4] == ['list', 'devicetypes']:
                data = {'devicetypes': [{'name': 'iPhone 99', 'identifier': 'type'}]}
            else:
                return subprocess.CompletedProcess(args, 0, 'not-a-udid', '')
            return subprocess.CompletedProcess(args, 0, json.dumps(data), '')
        with patch('subprocess.run', side_effect=run) as run_mock:
            with self.assertRaisesRegex(RuntimeError, 'did not return'):
                h.create_owned_simulator()
            h._cleanup_owned_simulator()
        self.assertIsNone(h.owned_udid)
        self.assertFalse(any(c.args[0][2] == 'delete' for c in run_mock.call_args_list))

    def test_terminate_missing_process_is_narrowly_accepted(self):
        h = self.diagnostic_harness()
        message = ('An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=3):\n'
                   'Application termination failed.\n'
                   'Underlying error (domain=NSPOSIXErrorDomain, code=3): No such process')
        boundary, actions = self.simctl_boundary(h, failures={'terminate': (3, message)})
        with patch('subprocess.run', side_effect=boundary):
            h.reset_owned_session()
        self.assertIn('install', actions)

    def test_reset_rejects_unclassified_nonzero_and_blocks_later_actions(self):
        for action, blocked in [('terminate', 'keychain'), ('keychain', 'uninstall'),
                                ('uninstall', 'install'), ('install', None)]:
            with self.subTest(action=action):
                h = self.diagnostic_harness()
                boundary, actions = self.simctl_boundary(h, failures={action: (42, 'No such process')})
                with patch('subprocess.run', side_effect=boundary), self.assertRaises(RuntimeError):
                    h.reset_owned_session()
                if blocked:
                    self.assertNotIn(blocked, actions)

    def test_terminate_vague_missing_process_text_is_not_benign(self):
        h = self.diagnostic_harness()
        boundary, actions = self.simctl_boundary(h, failures={'terminate': (3, 'No such process')})
        with patch('subprocess.run', side_effect=boundary), self.assertRaises(RuntimeError):
            h.reset_owned_session()
        self.assertNotIn('keychain', actions)

    def test_not_installed_map_skips_only_benign_terminate_and_uninstall(self):
        h = self.diagnostic_harness()
        boundary, actions = self.simctl_boundary(h, installed=False)
        with patch('subprocess.run', side_effect=boundary):
            h.reset_owned_session()
        self.assertNotIn('terminate', actions)
        self.assertNotIn('uninstall', actions)
        self.assertEqual([a for a in actions if a not in ('list', 'listapps')],
                         ['keychain', 'install'])

    def test_installed_apps_malformed_or_unavailable_fails_closed(self):
        for output in ('not-json', '[]', '{"com.dedato.app": false}'):
            h = self.diagnostic_harness()
            boundary, actions = self.simctl_boundary(h)
            def run(args, **kwargs):
                if args[0] == '/usr/bin/plutil':
                    return subprocess.CompletedProcess(args, 0, output, '')
                return boundary(args, **kwargs)
            with patch('subprocess.run', side_effect=run), self.assertRaises(RuntimeError):
                h.reset_owned_session()
            self.assertNotIn('keychain', actions)

    def test_shutdown_nonzero_recorded_but_owned_delete_still_attempted(self):
        h = self.diagnostic_harness()
        boundary, actions = self.simctl_boundary(h, failures={'shutdown': (42, 'synthetic error')})
        with patch('subprocess.run', side_effect=boundary):
            errors = h.cleanup()
        self.assertEqual(errors[0]['action'], 'shutdown_simulator')
        self.assertIn('delete', actions)
        self.assertEqual(actions[actions.index('delete') - 1], 'list')
        self.assertIsNone(h.owned_udid)

    def test_already_shutdown_state_skips_shutdown_without_error(self):
        h = self.diagnostic_harness()
        payload = {'devices': {'runtime': [{'udid': h.owned_udid, 'name': h.owned_name,
                                           'isAvailable': True, 'state': 'Shutdown'}]}}
        boundary, actions = self.simctl_boundary(h, devices=payload)
        with patch('subprocess.run', side_effect=boundary):
            self.assertEqual(h.cleanup(), [])
        self.assertNotIn('shutdown', actions)
        self.assertIn('delete', actions)

    def test_delete_failure_does_not_skip_process_cleanup(self):
        h = self.diagnostic_harness()
        child = Mock(pid=204)
        child.poll.return_value = None
        h.children = [child]
        boundary, actions = self.simctl_boundary(h, failures={'delete': (42, 'synthetic error')})
        with patch('subprocess.run', side_effect=boundary), patch('os.killpg') as kill:
            errors = h.cleanup()
        self.assertEqual(errors[0]['action'], 'delete_owned_simulator')
        kill.assert_called_once_with(204, gate.signal.SIGTERM)

    def test_historical_and_metro_api_lines_do_not_satisfy_flow(self):
        h = self.diagnostic_harness()
        line = 'Effective API_URL (axios baseURL): http://127.0.0.1:8000\n'
        with self.assertRaisesRegex(RuntimeError, 'runtime API evidence'):
            self.exercise_flows(h, {}, initial=line * 5, metro=line * 5)
        self.assertEqual(h.current_flow, gate.FLOWS[0])

    def test_duplicate_first_flow_evidence_cannot_satisfy_second(self):
        h = self.diagnostic_harness()
        line = 'Effective API_URL (axios baseURL): http://127.0.0.1:8000\n'
        with self.assertRaisesRegex(RuntimeError, 'runtime API evidence'):
            self.exercise_flows(h, {gate.FLOWS[0]: line * 8})
        self.assertEqual(h.current_flow, gate.FLOWS[1])

    def test_missing_middle_flow_evidence_stops_at_that_flow(self):
        h = self.diagnostic_harness()
        line = 'Effective API_URL (axios baseURL): http://127.0.0.1:8000\n'
        emissions = {f: line for f in gate.FLOWS}
        emissions.pop(gate.FLOWS[2])
        with self.assertRaisesRegex(RuntimeError, 'runtime API evidence'):
            self.exercise_flows(h, emissions)
        self.assertEqual(h.current_flow, gate.FLOWS[2])

    def test_each_flow_has_distinct_maestro_log_and_exitcode(self):
        h = self.diagnostic_harness()
        line = 'Effective API_URL (axios baseURL): http://127.0.0.1:8000\n'
        self.exercise_flows(h, {f: line for f in gate.FLOWS})
        for flow in gate.FLOWS:
            name = 'maestro-' + Path(flow).stem
            self.assertTrue((h.run_dir / (name + '.log')).exists())
            self.assertEqual((h.run_dir / (name + '.exitcode')).read_text(), '0')
        self.assertFalse((h.run_dir / 'maestro.log').exists())

    def test_primary_failures_survive_real_cleanup_identity_timeout(self):
        for kind in ('maestro', 'network', 'timeout', 'interrupt'):
            with self.subTest(kind=kind):
                h = self.diagnostic_harness()
                (h.run_dir / 'app-runtime.log').write_text('ERR_NETWORK' if kind == 'network' else '')
                child = Mock(pid=205)
                child.poll.return_value = None
                h.children = [child]
                proc = Mock(pid=206)
                proc.poll.return_value = None
                proc.wait.side_effect = [KeyboardInterrupt() if kind == 'interrupt' else
                                        subprocess.TimeoutExpired(['maestro'], 300), 0]
                if kind in ('maestro', 'network'):
                    action = lambda: h.finish_maestro(1 if kind == 'maestro' else 0)
                else:
                    action = lambda: h.run_one_maestro(gate.FLOWS[0])
                with patch('subprocess.run', side_effect=subprocess.TimeoutExpired(['simctl'], 120)), \
                        patch('subprocess.Popen', return_value=proc), patch('os.killpg') as kill:
                    # Runtime wait fails; later cleanup can still stop this child.
                    code, out, err = self.invoke_main(h, run_action=action)
                self.assertEqual(code, 1)
                self.assertNotIn('IOS MAESTRO GATE PASS', out)
                self.assertIn('identify_owned_simulator', err)
                self.assertLess(err.index('ERROR:'), err.index('ERROR: cleanup'))
                if kind == 'maestro':
                    self.assertIn('Maestro failed (exit 1)', err)
                elif kind == 'network':
                    self.assertIn('Runtime ERR_NETWORK', err)
                elif kind == 'timeout':
                    self.assertIn('300', err)
                self.assertTrue(any(c.args == (205, gate.signal.SIGTERM) for c in kill.call_args_list))

    def test_changed_identity_before_delete_blocks_delete_only(self):
        h = self.diagnostic_harness()
        boundary, actions = self.simctl_boundary(h)
        list_count = 0
        def run(args, **kwargs):
            nonlocal list_count
            if args[:4] == ['xcrun', 'simctl', 'list', 'devices']:
                list_count += 1
                if list_count == 4:
                    payload = {'devices': {'runtime': [{'udid': h.owned_udid,
                        'name': 'DeDato-Maestro-other', 'isAvailable': True, 'state': 'Shutdown'}]}}
                    return subprocess.CompletedProcess(args, 0, json.dumps(payload), '')
            return boundary(args, **kwargs)
        with patch('subprocess.run', side_effect=run):
            errors = h.cleanup()
        self.assertNotIn('delete', actions)
        self.assertEqual(errors[-1]['action'], 'delete_owned_simulator')

    def test_uninstall_success_requires_absence_postcondition(self):
        h = self.diagnostic_harness()
        boundary, actions = self.simctl_boundary(h)
        def run(args, **kwargs):
            if args[:3] == ['xcrun', 'simctl', 'uninstall']:
                return subprocess.CompletedProcess(args, 0, '', '')
            return boundary(args, **kwargs)
        with patch('subprocess.run', side_effect=run), self.assertRaisesRegex(RuntimeError, 'remains installed'):
            h.reset_owned_session()
        self.assertNotIn('install', actions)


class RuntimeApiEvidenceTests(unittest.TestCase):
    def wall(self):
        return datetime(2026, 3, 1, 12, 0, 0, tzinfo=timezone.utc)

    def api_message(self):
        return f"I ReactNativeJS: '[ENV] Effective API_URL (axios baseURL):', '{gate.API}'"

    def record(self, *, pid=7001, wall=None, timestamp=None, message=None, **extra):
        start = wall or self.wall()
        ts = timestamp or (start + timedelta(seconds=1))
        payload = {
            'timestamp': ts.isoformat(),
            'processID': pid,
            'eventMessage': self.api_message() if message is None else message,
        }
        payload.update(extra)
        return json.dumps(payload) + '\n'

    def verify(self, payload, pid=7001, wall=None):
        gate.verify_ios_per_flow_api_evidence(
            payload if isinstance(payload, bytes) else payload.encode(),
            pid, wall or self.wall())

    def test_same_descriptor_append_passes(self):
        path = Path(tempfile.mkstemp(prefix='dedato-log-')[1])
        self.addCleanup(path.unlink)
        path.write_text('prefix\n')
        descriptor = gate.AppRuntimeLog(path)
        try:
            path.write_text('prefix\n' + self.record(), encoding='utf-8')
            self.verify(descriptor.read_suffix())
        finally:
            descriptor.close()
        self.assertTrue(descriptor.closed)

    def test_pathname_replacement_fails(self):
        path = Path(tempfile.mkstemp(prefix='dedato-log-')[1])
        self.addCleanup(lambda: path.exists() and path.unlink())
        path.write_text('history\n')
        descriptor = gate.AppRuntimeLog(path)
        try:
            path.unlink()
            path.write_text('history\n' + self.record())
            with self.assertRaisesRegex(RuntimeError, 'pathname identity changed'):
                descriptor.read_suffix()
        finally:
            descriptor.close()

    def test_truncate_regrow_same_inode_fails(self):
        path = Path(tempfile.mkstemp(prefix='dedato-log-')[1])
        self.addCleanup(path.unlink)
        path.write_bytes(b'x' * 120)
        descriptor = gate.AppRuntimeLog(path)
        try:
            path.write_bytes(b'y' * 200)
            with self.assertRaisesRegex(RuntimeError, 'prefix changed'):
                descriptor.read_suffix()
        finally:
            descriptor.close()

    def test_prefix_rewritten_fails(self):
        path = Path(tempfile.mkstemp(prefix='dedato-log-')[1])
        self.addCleanup(path.unlink)
        path.write_bytes(b'abcdef')
        descriptor = gate.AppRuntimeLog(path)
        try:
            with path.open('r+b') as handle:
                handle.seek(0)
                handle.write(b'zzzzzzEXTRA')
            with self.assertRaisesRegex(RuntimeError, 'prefix changed'):
                descriptor.read_suffix()
        finally:
            descriptor.close()

    def test_pathname_disappears_fails(self):
        path = Path(tempfile.mkstemp(prefix='dedato-log-')[1])
        descriptor = gate.AppRuntimeLog(path)
        try:
            path.unlink()
            with self.assertRaisesRegex(RuntimeError, 'disappeared'):
                descriptor.read_suffix()
        finally:
            descriptor.close()

    def test_fstat_error_is_controlled(self):
        path = Path(tempfile.mkstemp(prefix='dedato-log-')[1])
        self.addCleanup(path.unlink)
        descriptor = gate.AppRuntimeLog(path)
        try:
            with patch('os.fstat', side_effect=OSError(5, 'private')):
                with self.assertRaises(OSError):
                    descriptor.read_suffix()
        finally:
            descriptor.close()
        self.assertTrue(descriptor.closed)

    def test_descriptor_closed_after_flow_failure(self):
        aux = IosSafetyTests()
        harness = aux.diagnostic_harness()
        closed = []
        real = gate.AppRuntimeLog.close

        def track(self):
            closed.append(self)
            real(self)

        with patch.object(gate.AppRuntimeLog, 'close', track):
            with self.assertRaises(RuntimeError):
                aux.exercise_flows(harness, {})
        self.assertTrue(closed)
        self.assertTrue(all(item.closed for item in closed))

    def test_no_append_fails(self):
        path = Path(tempfile.mkstemp(prefix='dedato-log-')[1])
        self.addCleanup(path.unlink)
        path.write_text('prefix\n')
        descriptor = gate.AppRuntimeLog(path)
        try:
            with self.assertRaisesRegex(RuntimeError, 'runtime API evidence'):
                self.verify(descriptor.read_suffix())
        finally:
            descriptor.close()

    def test_process_a_evidence_rejected_for_process_b(self):
        with self.assertRaisesRegex(RuntimeError, 'process identity mismatch'):
            self.verify(self.record(pid=111), pid=222)

    def test_post_maestro_pid_b_not_prelaunch_pid_a(self):
        aux = IosSafetyTests()
        harness = aux.diagnostic_harness()
        phase = {'maestro': False}

        def ps():
            return '222 DeDato\n' if phase['maestro'] else '111 DeDato\n'

        (harness.run_dir / 'app-runtime.log').write_text('')
        boundary, actions = aux.simctl_boundary(harness, ps_stdout=ps)

        def popen(args, **kwargs):
            proc = Mock(pid=50)
            proc.poll.return_value = None
            if args and args[0] == 'maestro':
                phase['maestro'] = True
                actions.append('maestro')

                def wait(timeout):
                    wall = harness.current_launch_wall
                    line = self.record(pid=222, timestamp=wall + timedelta(milliseconds=1))
                    with (harness.run_dir / 'app-runtime.log').open('a') as log:
                        log.write(line)
                    return 0

                proc.wait.side_effect = wait
            return proc

        harness.flows = [gate.FLOWS[0]]
        try:
            with patch('subprocess.run', side_effect=boundary), patch('subprocess.Popen', side_effect=popen):
                harness.tests()
        finally:
            for log in harness.logs:
                log.close()
        self.assertIn('maestro', actions)

    def test_launch_wall_precedes_bootstrap_and_pid_is_later(self):
        aux = IosSafetyTests()
        harness = aux.diagnostic_harness()
        order = []

        def ps():
            order.append('pid')
            return '4242 DeDato\n'

        (harness.run_dir / 'app-runtime.log').write_text('')
        boundary, _actions = aux.simctl_boundary(harness, ps_stdout=ps)

        def popen(args, **kwargs):
            proc = Mock(pid=9)
            proc.poll.return_value = None
            if args and args[0] == 'maestro':
                order.append('maestro')

                def wait(timeout):
                    order.append('evidence')
                    wall = harness.current_launch_wall
                    self.assertLess(wall, datetime.now(timezone.utc))
                    line = self.record(pid=4242, timestamp=wall + timedelta(milliseconds=1))
                    with (harness.run_dir / 'app-runtime.log').open('a') as log:
                        log.write(line)
                    return 0

                proc.wait.side_effect = wait
            return proc

        harness.flows = [gate.FLOWS[0]]
        try:
            with patch('subprocess.run', side_effect=boundary), patch('subprocess.Popen', side_effect=popen):
                harness.tests()
        finally:
            for log in harness.logs:
                log.close()
        self.assertEqual(order, ['maestro', 'evidence', 'pid'])

    def test_collector_uses_ndjson(self):
        source = inspect.getsource(gate.Harness.start_runtime_log)
        self.assertIn("'ndjson'", source)
        self.assertNotIn("'json'", source.replace("'ndjson'", ''))

    def test_json_array_is_not_ndjson_success(self):
        row = json.loads(self.record().strip())
        with self.assertRaisesRegex(RuntimeError, 'Malformed'):
            self.verify(json.dumps([row]) + '\n')

    def test_malformed_json_fails(self):
        with self.assertRaisesRegex(RuntimeError, 'Malformed'):
            self.verify(b'{not-json}\n')

    def test_metadata_url_cannot_satisfy_evidence(self):
        payload = json.dumps({
            'timestamp': (self.wall() + timedelta(seconds=1)).isoformat(),
            'processID': 7001,
            'eventMessage': 'boot',
            'subsystem': gate.API,
        }) + '\n'
        with self.assertRaisesRegex(RuntimeError, 'runtime API evidence'):
            self.verify(payload)

    def test_event_message_url_satisfies_evidence(self):
        self.verify(self.record())

    def test_exact_one_dedato_pid(self):
        self.assertEqual(gate.parse_exact_dedato_pids('4242 DeDato\n'), [4242])

    def test_zero_then_one_pid(self):
        answers = iter(['\n', '4242 DeDato\n'])
        harness = IosSafetyTests().diagnostic_harness()

        def run(args, **kwargs):
            if 'ps' in args:
                return subprocess.CompletedProcess(args, 0, next(answers), '')
            return subprocess.CompletedProcess(args, 0, '', '')

        with patch('subprocess.run', side_effect=run), patch('time.sleep'):
            self.assertEqual(harness.wait_for_exact_dedato_pid(timeout=1), 4242)

    def test_zero_until_timeout_fails(self):
        harness = IosSafetyTests().diagnostic_harness()

        def run(args, **kwargs):
            return subprocess.CompletedProcess(args, 0, '11 DeDatoHelper\n', '')

        with patch('subprocess.run', side_effect=run), patch('time.sleep'), \
                patch('time.monotonic', side_effect=[0, 0.5, 2]):
            with self.assertRaisesRegex(RuntimeError, 'Timed out'):
                harness.wait_for_exact_dedato_pid(timeout=1)

    def test_helper_name_is_not_dedato(self):
        self.assertEqual(gate.parse_exact_dedato_pids('11 DeDatoHelper\n'), [])

    def test_helper_plus_dedato_selects_exact_name(self):
        self.assertEqual(gate.parse_exact_dedato_pids('11 DeDatoHelper\n22 DeDato\n'), [22])

    def test_two_exact_dedato_processes_fail(self):
        harness = IosSafetyTests().diagnostic_harness()

        def run(args, **kwargs):
            return subprocess.CompletedProcess(args, 0, '1 DeDato\n2 DeDato\n', '')

        with patch('subprocess.run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'Multiple DeDato'):
                harness.wait_for_exact_dedato_pid(timeout=1)

    def test_ps_nonzero_with_matching_stdout_fails(self):
        harness = IosSafetyTests().diagnostic_harness()

        def run(args, **kwargs):
            return subprocess.CompletedProcess(args, 42, '4242 DeDato\n', '')

        with patch('subprocess.run', side_effect=run):
            with self.assertRaisesRegex(RuntimeError, 'exit 42'):
                harness.wait_for_exact_dedato_pid(timeout=1)

    def test_partial_matching_line_without_newline_fails(self):
        with self.assertRaisesRegex(RuntimeError, 'runtime API evidence'):
            self.verify(self.record().encode().rstrip(b'\n'))

    def test_malformed_utf8_complete_record_fails_safely(self):
        with self.assertRaisesRegex(RuntimeError, 'Malformed'):
            self.verify(b'\xff\xfe{"processID":7001}\n')

    def test_old_timestamp_fails(self):
        with self.assertRaisesRegex(RuntimeError, 'timestamp before current launch'):
            self.verify(self.record(timestamp=self.wall() - timedelta(seconds=30)))

    def test_historical_valid_lines_before_flow_cannot_satisfy_current_flow(self):
        aux = IosSafetyTests()
        harness = aux.diagnostic_harness()
        with self.assertRaisesRegex(RuntimeError, 'runtime API evidence'):
            aux.exercise_flows(harness, {}, initial=self.record() * 5)

    def test_flow_one_records_cannot_satisfy_flow_two(self):
        aux = IosSafetyTests()
        harness = aux.diagnostic_harness()
        with self.assertRaisesRegex(RuntimeError, 'runtime API evidence'):
            aux.exercise_flows(harness, {gate.FLOWS[0]: 'fresh'})
        self.assertEqual(harness.current_flow, gate.FLOWS[1])

    def test_missing_flow_three_evidence_fails_full_run(self):
        aux = IosSafetyTests()
        harness = aux.diagnostic_harness()
        emissions = {flow: 'fresh' for flow in gate.FLOWS}
        emissions.pop(gate.FLOWS[2])
        with self.assertRaisesRegex(RuntimeError, 'runtime API evidence'):
            aux.exercise_flows(harness, emissions)
        self.assertEqual(harness.current_flow, gate.FLOWS[2])

    def test_maestro_failure_is_not_replaced_by_pid_lookup(self):
        aux = IosSafetyTests()
        harness = aux.diagnostic_harness()

        def ps():
            raise AssertionError('PID lookup must not run after Maestro failure')

        with self.assertRaisesRegex(RuntimeError, r'Maestro failed \(exit 1\)'):
            aux.exercise_flows(harness, {}, maestro_code=1, ps_stdout=ps)
        self.assertEqual(harness.current_flow, gate.FLOWS[0])


class PrimaryFailurePreservationTests(unittest.TestCase):
    def harness(self):
        aux = IosSafetyTests()
        harness = aux.diagnostic_harness()
        harness.current_flow = gate.FLOWS[0]
        harness.secondary_errors = []
        (harness.run_dir / 'app-runtime.log').write_text('boot\n')
        return aux, harness

    def test_maestro_exit_with_normal_logs_stays_primary(self):
        _aux, harness = self.harness()
        with self.assertRaisesRegex(RuntimeError, r'Maestro failed \(exit 1\)'):
            harness.finish_maestro(1)

    def test_runtime_log_oserror_does_not_replace_maestro_failure(self):
        _aux, harness = self.harness()
        harness.app_runtime_log_text = Mock(side_effect=OSError(5, 'secret-runtime'))
        with self.assertRaisesRegex(RuntimeError, r'Maestro failed \(exit 1\)'):
            harness.finish_maestro(1)
        self.assertEqual(harness.secondary_errors[0]['action'], 'read_app_runtime_log')
        self.assertNotIn('secret-runtime', json.dumps(harness.secondary_errors))

    def test_runtime_log_utf8_error_does_not_replace_maestro_failure(self):
        _aux, harness = self.harness()
        harness.app_runtime_log_text = Mock(
            side_effect=UnicodeDecodeError('utf-8', b'\xff', 0, 1, 'invalid'))
        with self.assertRaisesRegex(RuntimeError, r'Maestro failed \(exit 1\)'):
            harness.finish_maestro(1)
        self.assertEqual(harness.secondary_errors[0]['action'], 'read_app_runtime_log')
        self.assertEqual(harness.secondary_errors[0]['error_type'], 'UnicodeDecodeError')

    def test_maestro_log_read_failure_does_not_replace_maestro_failure(self):
        _aux, harness = self.harness()
        harness._print_maestro_log = Mock(side_effect=OSError(5, 'secret-maestro-log'))
        with self.assertRaisesRegex(RuntimeError, r'Maestro failed \(exit 1\)'):
            harness.finish_maestro(1)
        self.assertEqual(harness.secondary_errors[0]['action'], 'read_maestro_log')

    def test_snapshot_failure_does_not_replace_maestro_failure(self):
        _aux, harness = self.harness()
        harness._record_failure_snapshot = Mock(side_effect=OSError(5, 'secret-snapshot'))
        with self.assertRaisesRegex(RuntimeError, r'Maestro failed \(exit 1\)'):
            harness.finish_maestro(1)
        self.assertEqual(harness.secondary_errors[0]['action'], 'failure_snapshot')

    def _run_until_close(self, aux, harness, close_error=None, calls=None, **exercise_kwargs):
        calls = [] if calls is None else calls
        real_close = gate.AppRuntimeLog.close

        def tracked(self):
            calls.append(self)
            if close_error is not None:
                self.closed = True
                raise close_error
            real_close(self)

        with patch.object(gate.AppRuntimeLog, 'close', tracked):
            try:
                aux.exercise_flows(harness, **exercise_kwargs)
            finally:
                for log in harness.logs:
                    try:
                        log.close()
                    except Exception:
                        pass
        return calls

    def test_maestro_failure_survives_descriptor_close_error(self):
        aux, harness = self.harness()
        calls = []
        with self.assertRaisesRegex(RuntimeError, r'Maestro failed \(exit 1\)'):
            self._run_until_close(
                aux, harness, close_error=OSError(5, 'secret-close'),
                emissions={}, maestro_code=1, calls=calls)
        self.assertEqual(len(calls), 1)
        self.assertEqual(harness.secondary_errors[-1]['action'], 'close_runtime_log')

    def test_reset_failure_survives_descriptor_close_error(self):
        aux, harness = self.harness()
        boundary, _actions = aux.simctl_boundary(harness, failures={'keychain': (42, 'synthetic')})
        calls = []

        def tracked(self):
            calls.append(1)
            self.closed = True
            raise OSError(5, 'secret-close')

        (harness.run_dir / 'app-runtime.log').write_text('')
        with patch.object(gate.AppRuntimeLog, 'close', tracked), \
                patch('subprocess.run', side_effect=boundary), \
                patch('subprocess.Popen', return_value=Mock(pid=1, poll=Mock(return_value=None))):
            with self.assertRaisesRegex(RuntimeError, 'simctl keychain failed'):
                harness.tests()
        self.assertEqual(calls, [1])
        self.assertEqual(harness.secondary_errors[-1]['action'], 'close_runtime_log')

    def test_pid_failure_survives_descriptor_close_error(self):
        aux, harness = self.harness()
        calls = []

        def tracked(self):
            calls.append(1)
            self.closed = True
            raise OSError(5, 'secret-close')

        with patch.object(gate.AppRuntimeLog, 'close', tracked):
            with self.assertRaisesRegex(RuntimeError, 'process inspection failed'):
                aux.exercise_flows(harness, {gate.FLOWS[0]: 'fresh'},
                                   ps_stdout=lambda: (42, '4242 DeDato\n'))
        self.assertEqual(calls, [1])
        self.assertEqual(harness.secondary_errors[-1]['action'], 'close_runtime_log')

    def test_evidence_failure_survives_descriptor_close_error(self):
        aux, harness = self.harness()
        calls = []

        def tracked(self):
            calls.append(1)
            self.closed = True
            raise OSError(5, 'secret-close')

        with patch.object(gate.AppRuntimeLog, 'close', tracked):
            with self.assertRaisesRegex(RuntimeError, 'runtime API evidence'):
                aux.exercise_flows(harness, {})
        self.assertEqual(calls, [1])

    def test_success_plus_descriptor_close_error_fails(self):
        aux, harness = self.harness()
        harness.flows = [gate.FLOWS[0]]

        def tracked(self):
            self.closed = True
            raise OSError(5, 'secret-close')

        with patch.object(gate.AppRuntimeLog, 'close', tracked):
            with self.assertRaises(OSError):
                aux.exercise_flows(harness, {gate.FLOWS[0]: 'fresh'})
        self.assertEqual(harness.secondary_errors[-1]['action'], 'close_runtime_log')

    def test_success_closes_descriptor_once(self):
        aux, harness = self.harness()
        harness.flows = [gate.FLOWS[0]]
        calls = []
        real_close = gate.AppRuntimeLog.close

        def tracked(self):
            calls.append(1)
            real_close(self)

        with patch.object(gate.AppRuntimeLog, 'close', tracked):
            aux.exercise_flows(harness, {gate.FLOWS[0]: 'fresh'})
        self.assertEqual(calls, [1])
        self.assertEqual(harness.secondary_errors, [])

    def test_err_network_still_fails_successful_maestro(self):
        _aux, harness = self.harness()
        (harness.run_dir / 'app-runtime.log').write_text('ERR_NETWORK\n')
        with self.assertRaisesRegex(RuntimeError, 'ERR_NETWORK'):
            harness.finish_maestro(0)


if __name__ == '__main__':
    unittest.main()
