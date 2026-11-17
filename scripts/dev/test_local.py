"""Unit checks plus opt-in real lifecycle checks for the isolated local stack.

DEDATO_LOCAL_INTEGRATION=1 python3 -m unittest discover -s scripts/dev -p test_local.py -v
The integration test starts/stops ONLY the managed .local/dedato stack.
"""
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('dedato_local', Path(__file__).with_name('local.py'))
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)

LOCAL_SOURCE = Path(local.__file__)
LOG_NAMES = ('backend.log', 'frontend.log', 'launcher.log')


class IsolationTest(unittest.TestCase):
    def _temp_launcher(self):
        root = Path(tempfile.mkdtemp(prefix='dedato_logs_'))
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        launcher = root / 'scripts' / 'dev' / 'local.py'
        launcher.parent.mkdir(parents=True)
        shutil.copy2(LOCAL_SOURCE, launcher)
        state = root / '.local' / 'dedato'
        return root, launcher, state

    def _run_logs(self, launcher, cwd):
        return subprocess.run([sys.executable, str(launcher), 'logs'],
                              capture_output=True, text=True, check=True, cwd=cwd)

    def _expected_log_paths(self, state):
        return [str((state / name).resolve()) for name in LOG_NAMES]
    def test_environment_does_not_inherit_remote_configuration(self):
        with patch.dict(os.environ, {'DATABASE_URL': 'postgresql://remote/db',
                                    'VITE_API_BASE_URL': 'https://test.dedato.ru',
                                    'HTTP_PROXY': 'http://proxy', 'UNISENDER_API_KEY': 'secret'}):
            env = local.clean_env()
        for key in ('DATABASE_URL', 'VITE_API_BASE_URL', 'HTTP_PROXY', 'UNISENDER_API_KEY'):
            self.assertNotIn(key, env)

    def test_http_client_rejects_nonlocal_targets(self):
        for url in ['https://test.dedato.ru', 'http://dedato.ru', 'http://127.0.0.1.evil.test', 'file:///tmp/x']:
            with self.subTest(url=url), self.assertRaises(RuntimeError):
                local.request(url)

    def test_log_paths(self):
        from io import StringIO
        expected = [str((local.STATE / name).resolve())
                    for name in ('backend.log', 'frontend.log', 'launcher.log')]
        with patch('sys.stdout', new_callable=StringIO) as out:
            local.log_paths()
        self.assertEqual(out.getvalue().strip().splitlines(), expected)

    def test_logs_cli_without_state_dir(self):
        root, launcher, state = self._temp_launcher()
        self.assertFalse((root / '.local').exists())
        result = self._run_logs(launcher, root)
        self.assertEqual(result.stdout.strip().splitlines(), self._expected_log_paths(state))
        self.assertEqual(result.stderr, '')
        self.assertFalse((root / '.local').exists())

    def test_logs_json_cli_without_state_dir(self):
        root, launcher, state = self._temp_launcher()
        expected = dict(zip(('backend', 'frontend', 'launcher'), self._expected_log_paths(state)))
        for args in (['logs', '--json'], ['--json', 'logs']):
            with self.subTest(args=args):
                result = subprocess.run([sys.executable, str(launcher), *args],
                                        capture_output=True, text=True, check=True, cwd=launcher.parent,
                                        timeout=10)
                self.assertEqual(json.loads(result.stdout), expected)
                self.assertEqual(len(result.stdout.splitlines()), 1)
                self.assertEqual(result.stderr, '')
                self.assertFalse((root / '.local').exists())

    def test_json_rejected_for_other_commands_without_state_dir(self):
        root, launcher, _state = self._temp_launcher()
        commands = ([action] for action in ('start', 'stop', 'status', '_serve'))
        cases = [['--json']]
        for command in commands:
            cases.extend([command + ['--json'], ['--json'] + command])
        for args in cases:
            with self.subTest(args=args):
                result = subprocess.run([sys.executable, str(launcher), *args],
                                        capture_output=True, text=True, cwd=root, timeout=10)
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, '')
                self.assertIn('--json доступна только для команды logs', result.stderr)
                self.assertFalse((root / '.local').exists())

    def test_logs_cli_leaves_existing_logs_unchanged(self):
        root, launcher, state = self._temp_launcher()
        state.mkdir(parents=True)
        before = {}
        for name in LOG_NAMES:
            path = state / name
            text = 'MARKER-%s-SECRET-LINE\n' % name
            path.write_text(text, encoding='utf-8')
            st = path.stat()
            before[name] = {'bytes': path.read_bytes(), 'mtime_ns': st.st_mtime_ns, 'size': st.st_size}
        result = self._run_logs(launcher, root)
        self.assertEqual(result.stdout.strip().splitlines(), self._expected_log_paths(state))
        combined = result.stdout + result.stderr
        for name in LOG_NAMES:
            path = state / name
            st = path.stat()
            self.assertEqual(path.read_bytes(), before[name]['bytes'])
            self.assertEqual(st.st_mtime_ns, before[name]['mtime_ns'])
            self.assertEqual(st.st_size, before[name]['size'])
            self.assertNotIn('MARKER-%s-SECRET-LINE' % name, combined)


@unittest.skipUnless(os.environ.get('DEDATO_LOCAL_INTEGRATION') == '1', 'real stack is opt-in')
class LifecycleTest(unittest.TestCase):
    def cli(self, action='start'):
        result = subprocess.run([sys.executable, str(Path(local.__file__)), action, '--no-open'],
                                capture_output=True, text=True, timeout=150)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        return result

    def state(self):
        return json.loads((local.STATE / 'state.json').read_text())

    def test_lifecycle(self):
        self.cli('stop')
        # Concurrent cold starts must return the exact same live stack.
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(lambda _: self.cli(), range(2)))
        state = self.state()
        for result in results:
            self.assertIn(state['url'], result.stdout)
        self.assertTrue(local.owned_health(state))
        self.assertNotIn(int(state['url'].rsplit(':', 1)[1]), (8000, 5173))
        inode = (local.STATE / 'local.db').stat().st_ino
        seed_time = (local.STATE / 'seed.json').stat().st_mtime_ns
        self.cli()
        self.assertEqual(state['run_id'], self.state()['run_id'])
        self.assertEqual(state['backend_pid'], self.state()['backend_pid'])
        self.assertEqual(state['frontend_pid'], self.state()['frontend_pid'])
        hmr = local.request(state['url'] + '/@vite/client')
        self.assertIn(state['url'].rsplit(':', 1)[1], hmr)
        self.assertNotIn('"127.0.0.1:5173', hmr)
        self.cli('stop')
        for key in ('backend_pid', 'frontend_pid'):
            with self.assertRaises(ProcessLookupError):
                os.kill(state[key], 0)
        self.cli()
        self.assertNotEqual(state['run_id'], self.state()['run_id'])
        self.assertEqual(inode, (local.STATE / 'local.db').stat().st_ino)
        self.assertEqual(seed_time, (local.STATE / 'seed.json').stat().st_mtime_ns)
        # Recover a failed owned frontend without leaving a second backend.
        state = self.state()
        os.kill(state['frontend_pid'], signal.SIGTERM)
        time.sleep(2)
        self.cli()
        self.assertNotEqual(state['run_id'], self.state()['run_id'])
        self.assertTrue(local.owned_health(self.state()))
        # Abrupt supervisor death: inherited lock + watchdog prevent orphans.
        state = self.state()
        os.kill(state['pid'], signal.SIGKILL)
        self.cli()
        self.assertNotEqual(state['run_id'], self.state()['run_id'])
        self.assertTrue(local.owned_health(self.state()))
        self.assertEqual(seed_time, (local.STATE / 'seed.json').stat().st_mtime_ns)


if __name__ == '__main__':
    unittest.main()
