#!/usr/bin/env python3
"""Local-only Android Maestro gate. No store artifact or existing server reuse."""
import json
from datetime import datetime, timezone
import os
from pathlib import Path
import re
import shutil
import signal
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MOBILE = ROOT / 'mobile'
APP_ID = 'ru.dedato.mobile'
API = 'http://10.0.2.2:8000'
BACKEND = 'http://127.0.0.1:8000'
METRO = 'http://127.0.0.1:8081'
LINK = 'dedato://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
AVD = 'Medium_Phone_API_36.1'
FLOWS = [f'.maestro/flows/{name}.yaml' for name in (
    '01-login-success', '02-login-error', '03-navigate-to-bookings',
    '04-open-booking-details', '05-logout')]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def verify_repository():
    # Recognize the known two-checkout layout without binding other workstations
    # to it or inspecting the legacy checkout's contents.
    home = Path.home()
    legacy = home / 'DeDato'
    if (home / 'DDTO/DeDato/.git').exists():
        paths = (Path(__file__).absolute(), ROOT, Path.cwd())
        require(not any(p == legacy or legacy in p.parents for p in paths),
                'Known legacy clone refused; use the maintained checkout')
    top = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], cwd=ROOT,
                                  env=local_env(os.environ), text=True, timeout=10).strip()
    require(ROOT == Path(top).resolve(), 'Script ROOT must equal its actual Git toplevel')


def select_tool(candidates, args, pattern, env):
    for candidate in dict.fromkeys(str(p) for p in candidates if p):
        try:
            result = subprocess.run([candidate, *args], env=env, capture_output=True,
                                    text=True, check=True, timeout=10)
        except (OSError, subprocess.SubprocessError):
            continue
        if re.search(pattern, result.stdout + result.stderr, re.MULTILINE):
            return Path(candidate).resolve(), result
    raise RuntimeError('No compatible installed tool found; select Node 20.19.4 / Java 17 manually')


def validate_inputs(env, flows):
    for key, expected in {
        'API_URL': API, 'API_URL_ANDROID': API, 'EXPO_PUBLIC_API_URL': API,
        'E2E_BACKEND_URL': BACKEND, 'WEB_URL': 'http://10.0.2.2:5173',
        'EXPO_PUBLIC_WEB_URL': 'http://10.0.2.2:5173', 'APP_ID': APP_ID,
        'E2E_PHONE_DIGITS': '9991111111', 'E2E_PASSWORD': 'e2e123',
    }.items():
        require(not env.get(key) or env[key] == expected, f'Unsafe/unsupported override: {key}')
    require(env.get('ENVIRONMENT', 'development').lower() != 'production', 'Production forbidden')
    for key in ('DATABASE_URL', 'E2E_DATABASE_PATH', 'MAESTRO_ALLOW_PRODUCTION_BACKEND',
                'MAESTRO_ALLOW_EXPO_GO'):
        require(not env.get(key), f'{key} must be unset; harness owns disposable targets')
    require(all(flow in FLOWS for flow in flows), 'Only the five reviewed release-gate flows are allowed')


def local_env(source):
    # Do not inherit provider credentials, proxies, or backend secrets.
    env = {k: source[k] for k in ('HOME', 'USER', 'LOGNAME', 'PATH', 'LANG', 'TMPDIR') if k in source}
    env.update({
        'LANG': 'en_US.UTF-8', 'CI': '1', 'EXPO_NO_TELEMETRY': '1', 'EXPO_NO_DOTENV': '1',
        'EXPO_OFFLINE': '1',
        'API_URL': API, 'API_URL_ANDROID': API, 'EXPO_PUBLIC_API_URL': API,
        'WEB_URL': 'http://10.0.2.2:5173', 'EXPO_PUBLIC_WEB_URL': 'http://10.0.2.2:5173',
        'APP_UNIVERSAL_LINK_HOSTS': 'localhost', 'PUBLIC_APP_LINK_ORIGIN': 'http://localhost:5173',
        'EXTRA_UNIVERSAL_LINK_HOSTS': '', 'YANDEX_MOBILE_AUTH_VISIBLE': '0',
        'EXPO_PUBLIC_YANDEX_MOBILE_AUTH_VISIBLE': '0',
        'EXPO_PUBLIC_APPMETRICA_API_KEY': '', 'APPMETRICA_API_KEY': '',
        'EXPO_PUBLIC_APPMETRICA_TEST_EVENT_ENABLED': 'false',
        'ENVIRONMENT': 'development', 'DEV_E2E': 'true', 'ZVONOK_MODE': 'stub',
        'ROBOKASSA_MODE': 'stub', 'EMAIL_ENABLED': 'false', 'APPLE_IAP_ENABLED': 'false',
        'YANDEX_AUTH_ENABLED': 'false', 'PUSH_NOTIFICATIONS_ENABLED': 'false',
        'PUSH_REGISTRATION_ENABLED': 'false', 'PUSH_NOTIFICATION_USER_ALLOWLIST': '',
        'ENABLE_DEV_TESTDATA': '', 'FRONTEND_URL': 'http://localhost:5173', 'API_BASE_URL': BACKEND,
        'PYTHONDONTWRITEBYTECODE': '1', 'MAESTRO_CLI_NO_ANALYTICS': '1',
    })
    for key in ('DEBUG_HTTP', 'DEBUG_AUTH', 'DEBUG_FEATURES', 'DEBUG_MENU', 'DEBUG_DASHBOARD',
                'DEBUG_LOGS', 'DEBUG_MOBILE_ERRORS', 'DEBUG_AUTH_TRACE'):
        env[key] = '0'
    return env


def require_free_port(port):
    # Never request health/seed from, reuse, or kill an unknown listener.
    with socket.socket() as sock:
        # Ignore TIME_WAIT from our completed run, never an active listener.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('127.0.0.1', port))
        except OSError:
            raise RuntimeError(f'Port {port} occupied; stop its owner manually. No process was killed.')


def http(url, data=None, headers=None, timeout=3):
    require(url.startswith(BACKEND + '/') or url.startswith(METRO + '/'), 'Non-local HTTP refused')
    request = urllib.request.Request(url, data=data, headers=headers or {})
    # No inherited proxy and no redirects (including localhost -> production).
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(request, timeout=timeout) as r:
        require(r.status == 200, 'Expected HTTP 200')
        return r.read()


def verify_runtime_api(log, flow_count):
    urls = re.findall(r"Effective API_URL \(axios baseURL\):['\", ]+(https?://[^\s'\",]+)", log)
    require(len(urls) >= flow_count and set(urls) == {API}, 'Missing/non-local runtime API evidence')


def stamp():
    return {'wall': datetime.now(timezone.utc).isoformat(), 'monotonic': time.monotonic()}


def diagnostic_exc_record(name, exc):
    """Sanitized diagnostic failure. No command output, bodies, or exception args."""
    cause = getattr(exc, 'reason', exc)
    number = getattr(cause, 'errno', None)
    if not isinstance(number, int):
        number = getattr(exc, 'errno', None)
    status = 'unavailable' if isinstance(exc, FileNotFoundError) else 'error'
    return {
        'name': name,
        'status': status,
        'error_type': type(exc).__name__,
        'errno': number if isinstance(number, int) else None,
        'os_error': os.strerror(number) if isinstance(number, int) else None,
        'description': 'timeout' if isinstance(exc, subprocess.TimeoutExpired) else status,
    }


def observe(check):
    """One bounded observation, never a retry. Do not dump responses/credentials."""
    start = stamp()
    try:
        result = {'ok': True, 'value': check()}
    except Exception as exc:
        result = {'ok': False, **diagnostic_exc_record('observe', exc),
                  'http_status': getattr(exc, 'code', None)}
    return {**start, **result, 'end_monotonic': time.monotonic()}


class Harness:
    def __init__(self, flows):
        self.flows = flows
        self.children = []
        self.logs = []
        self.processes = {}
        self.exit_seen = set()
        self.android_probe_supported = False
        self.serial = None
        self.reverse_added = False
        self.handwriting_before = None
        self.cleanup_errors = []
        self.run_dir = Path(tempfile.mkdtemp(prefix='dedato-maestro-', dir='/private/tmp' if sys.platform == 'darwin' else '/tmp'))
        self.env = local_env(os.environ)
        # Expo's supported per-process cache override; no writes to ~/.expo.
        self.env['__UNSAFE_EXPO_HOME_DIRECTORY'] = str(self.run_dir / 'expo-cache')
        print(f'Artifacts (retained on success/failure): {self.run_dir}', flush=True)

    def cmd(self, args, cwd=ROOT, capture=True, timeout=120):
        return subprocess.run([str(a) for a in args], cwd=cwd, env=self.env, check=True,
                              text=True, capture_output=capture, timeout=timeout).stdout

    def spawn(self, args, name, cwd):
        log = (self.run_dir / f'{name}.log').open('w')
        self.logs.append(log)
        process = subprocess.Popen([str(a) for a in args], cwd=cwd, env=self.env,
                                   stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        self.children.append(process)
        (self.run_dir / f'{name}.pid').write_text(str(process.pid))
        if name in ('backend', 'metro'):
            self.processes[name] = process
            self.event('started', name, process)
        return process

    def event(self, event, name, process, **details):
        with (self.run_dir / 'process-events.jsonl').open('a') as log:
            log.write(json.dumps({**stamp(), 'event': event, 'name': name,
                                  'pid': process.pid, **details}) + '\n')

    def process_status(self, name):
        process = self.processes[name]
        code = process.poll()
        if code is not None and name not in self.exit_seen:
            self.exit_seen.add(name)
            # Timestamp is observation time, not a fabricated OS exit timestamp.
            self.event('exit_observed', name, process, exit_code=code,
                       signal=-code if code < 0 else None)
        return {'pid': process.pid, 'poll': code}

    def diagnostic_command(self, args, timeout=2, input=None):
        try:
            result = subprocess.run(args, cwd=ROOT, env=self.env, input=input,
                                    capture_output=True, text=True, timeout=timeout)
        except (subprocess.TimeoutExpired, OSError, subprocess.SubprocessError) as exc:
            return diagnostic_exc_record('diagnostic_command', exc)
        return {'status': 'ok', 'returncode': result.returncode,
                'stdout': result.stdout.strip(), 'stderr': result.stderr.strip()}

    def listener(self, port):
        require(port in (8000, 8081), 'Only local harness ports allowed')
        result = self.diagnostic_command(['lsof', '-nP', f'-iTCP:{port}', '-sTCP:LISTEN', '-Fpcn'])
        if result.get('status') in ('error', 'unavailable'):
            return {'present': False, 'pids': [], 'lsof': '',
                    **{k: result[k] for k in ('name', 'status', 'error_type', 'errno',
                                              'os_error', 'description') if k in result}}
        require(result.get('returncode') in (0, 1) and not result.get('stderr'), 'Listener inspection failed')
        pids = [int(line[1:]) for line in result.get('stdout', '').splitlines() if line.startswith('p')]
        return {'present': bool(pids), 'pids': pids, 'lsof': result.get('stdout', '')}

    def host_tcp(self):
        with socket.create_connection(('127.0.0.1', 8000), timeout=0.5):
            return 'connected'

    def android_probe(self):
        if not self.android_probe_supported:
            return {'supported': False}
        # TCP-only zero-I/O probe: no DNS, HTTP redirects, payload or EOF race.
        # Host HTTP health is measured separately; shell UID != application UID.
        result = self.diagnostic_command(
            ['adb', '-s', self.serial, 'shell', 'toybox', 'nc', '-n', '-z', '-w', '1',
             '10.0.2.2', '8000'], timeout=3)
        if result.get('status') in ('error', 'unavailable'):
            return {'supported': True, 'kind': 'shell_uid_tcp_connect', 'healthy': False, **result}
        return {'supported': True, 'kind': 'shell_uid_tcp_connect', 'returncode': result['returncode'],
                'healthy': result['returncode'] == 0,
                'stderr': result['stderr']}

    def diagnostic_sample(self):
        row = {**stamp()}
        row['backend'] = observe(lambda: self.process_status('backend'))
        row['metro'] = observe(lambda: self.process_status('metro'))
        row['listener_8000'] = observe(lambda: self.listener(8000))
        backend = row['backend'].get('value') or {}
        listener = row['listener_8000'].get('value') or {}
        owned = (row['backend'].get('ok') is True and backend.get('poll') is None
                 and listener.get('pids') == [backend.get('pid')])
        # Never probe an unknown/replacement listener, even though loopback.
        row['host_tcp'] = observe(self.host_tcp) if owned else {'skipped': 'no_verified_owned_listener'}
        row['host_health'] = observe(lambda: (http(BACKEND + '/health', timeout=0.5), 200)[1]) if owned else {'skipped': 'no_verified_owned_listener'}
        row['emulator_state'] = observe(lambda: self.diagnostic_command(['adb', '-s', self.serial, 'get-state']))
        row['android_health'] = observe(self.android_probe) if owned else {'skipped': 'no_verified_owned_listener'}
        row['end'] = stamp()
        return row

    def detect_android_probe(self):
        help_result = self.diagnostic_command(['adb', '-s', self.serial, 'shell', 'toybox', 'nc', '--help'])
        if help_result.get('status') in ('error', 'unavailable'):
            self.android_probe_supported = False
            try:
                (self.run_dir / 'android-probe-capability.json').write_text(json.dumps(help_result))
            except OSError:
                pass
            return help_result
        help_text = help_result.get('stdout', '') + help_result.get('stderr', '')
        self.android_probe_supported = help_result.get('returncode') == 0 and all(
            word in help_text for word in ('-n', '-w', '-z'))
        try:
            (self.run_dir / 'android-probe-capability.json').write_text(json.dumps(help_result))
        except OSError:
            pass
        return help_result

    def failure_snapshot(self):
        # One-shot, only on failure/timeout/interrupt. Best-effort; never a poller.
        snapshot = {**stamp()}
        snapshot['android_probe_capability'] = observe(self.detect_android_probe)
        sample = observe(self.diagnostic_sample)
        if sample.get('ok') and isinstance(sample.get('value'), dict):
            snapshot.update(sample['value'])
        else:
            snapshot['diagnostic_sample'] = sample
        snapshot['listener_8081'] = observe(lambda: self.listener(8081))
        pids = ','.join(str(p.pid) for p in self.processes.values())
        snapshot['owned_ps'] = observe(lambda: self.diagnostic_command(
            ['ps', '-p', pids, '-o', 'pid,ppid,pgid,lstart,etime,state,comm']))
        snapshot['adb_reverse'] = observe(lambda: self.diagnostic_command(['adb', '-s', self.serial, 'reverse', '--list']))
        try:
            (self.run_dir / 'failure-snapshot.json').write_text(json.dumps(snapshot, indent=2, default=str))
        except OSError as exc:
            print(f'WARN: failure-snapshot.json not written ({type(exc).__name__})', flush=True)
        for name in ('backend', 'app-runtime'):
            try:
                source = self.run_dir / f'{name}.log'
                text = source.read_text() if source.exists() else ''
                (self.run_dir / f'failure-{name}-tail.log').write_text(''.join(text.splitlines(True)[-100:]))
            except OSError:
                pass

    def _record_failure_snapshot(self):
        # Diagnostics must not replace the original gate exception.
        try:
            self.failure_snapshot()
        except Exception as exc:
            print(f'WARN: failure snapshot incomplete ({type(exc).__name__})', flush=True)

    def finish_maestro(self, result):
        (self.run_dir / 'maestro.exitcode').write_text(str(result))
        log = (self.run_dir / 'app-runtime.log').read_text()
        network_failure = 'ERR_NETWORK' in log or 'Failed to connect to /10.0.2.2:8000' in log
        if result != 0 or network_failure:
            self._record_failure_snapshot()  # no cleanup/kill before evidence
        require(result == 0, f'Maestro failed (exit {result}); artifacts retained')
        require(not network_failure, 'Runtime ERR_NETWORK observed; no further gate/retry')
        verify_runtime_api(log, len(self.flows))

    def wait(self, check, label, seconds=120, process=None):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            if process is not None:
                require(process.poll() is None, f'{label} process exited; see retained logs')
            try:
                if check():
                    return
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
            time.sleep(1)  # bounded readiness polling, never a UI/assertion sleep
        raise RuntimeError(f'Timed out waiting for {label}; see {self.run_dir}')

    def tools(self):
        home = Path.home()
        node, _ = select_tool([
            shutil.which('node', path=self.env['PATH']),
            Path(os.environ.get('NVM_DIR') or home / '.nvm') / 'versions/node/v20.19.4/bin/node',
        ], ['--version'], r'^v20\.19\.4$', self.env)
        java_bin, version = select_tool([
            Path(os.environ['JAVA_HOME']) / 'bin/java' if os.environ.get('JAVA_HOME') else None,
            shutil.which('java', path=self.env['PATH']),
            '/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java',
            '/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home/bin/java',
        ], ['-XshowSettings:properties', '-version'], r'version "17\.', self.env)
        # PATH may contain a shim; Gradle must receive the selected runtime's home.
        java_home = re.search(r'^\s*java\.home = (.+)$', version.stderr, re.MULTILINE)
        require(java_home is not None, f'Cannot determine Java home from {java_bin}')
        java = Path(java_home[1].strip())
        sdk = Path(os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT') or home / 'Library/Android/sdk')
        self.env.update(JAVA_HOME=str(java), ANDROID_HOME=str(sdk), ANDROID_SDK_ROOT=str(sdk))
        self.env['PATH'] = os.pathsep.join(map(str, [node.parent, java / 'bin', sdk / 'platform-tools', home / '.maestro/bin'])) + os.pathsep + self.env['PATH']
        for tool in ('node', 'java', 'adb', 'maestro', 'lsof'):
            require(shutil.which(tool, path=self.env['PATH']), f'Missing {tool}; install manually')
        require(self.cmd(['node', '--version']).strip() == 'v20.19.4', 'Node 20.19.4 required')
        version = subprocess.run(['java', '-version'], env=self.env, capture_output=True, text=True, check=True)
        require(re.search(r'version "17\.', version.stderr), 'Java 17 required')
        # Maestro 2.0.10 AppDirs logs use Java user.home. Redirect that process only;
        # preserve HOME, existing tool binaries, and the approved ~/.maestro driver cache.
        jvm_home = self.run_dir / 'jvm'
        jvm_home.mkdir()
        (jvm_home / '.maestro').symlink_to(home / '.maestro', target_is_directory=True)
        self.env['MAESTRO_OPTS'] = f'-Duser.home={jvm_home} -Djava.awt.headless=true'
        expected = (MOBILE / '.maestro/MAESTRO_VERSION').read_text().strip()
        require(self.cmd(['maestro', '--version']).strip() == expected, f'Maestro {expected} required')
        self.sdk = sdk
        self.python = ROOT / 'backend/.venv/bin/python'
        require(self.python.exists() and (MOBILE / 'node_modules/.bin/expo').exists(), 'Install locked dependencies/venv manually first')
        print(f'Toolchain: Node 20.19.4 / Java 17 / Maestro {expected}', flush=True)

    def adb(self, *args):
        return self.cmd(['adb', '-s', self.serial, *args])

    def emulator(self):
        devices = self.cmd(['adb', 'devices'])
        candidates = []
        for line in devices.splitlines():
            if not re.match(r'^emulator-\d+\s+device$', line):
                continue
            serial = line.split()[0]
            name = self.cmd(['adb', '-s', serial, 'emu', 'avd', 'name']).splitlines()[0].strip()
            if name == AVD:
                candidates.append(serial)
        require(len(candidates) <= 1, 'Multiple matching emulators; select/stop manually')
        if candidates:
            self.serial = candidates[0]
        else:
            emulator = self.sdk / 'emulator/emulator'
            require(AVD in self.cmd([emulator, '-list-avds']).splitlines(), f'Missing AVD {AVD}; no auto install')
            occupied = set(re.findall(r'emulator-(\d+)', devices))
            port = next((p for p in range(5554, 5586, 2) if str(p) not in occupied), None)
            require(port is not None, 'No free emulator slot')
            require_free_port(port)
            require_free_port(port + 1)
            self.serial = f'emulator-{port}'
            self.spawn([emulator, '-avd', AVD, '-port', str(port), '-no-snapshot-save', '-no-boot-anim'], 'emulator', ROOT)
        self.wait(lambda: self.adb('shell', 'getprop', 'sys.boot_completed').strip() == '1', 'emulator boot', 180)
        # API 36 Gboard may open its stylus tutorial on injected text-field taps.
        # This is emulator setup, not an optional app assertion. Restore on exit.
        before = self.adb('shell', 'settings', 'get', 'secure', 'stylus_handwriting_enabled').strip()
        require(before in ('null', '0', '1'), 'Unknown emulator handwriting setting')
        if before != '0':
            self.handwriting_before = before
            self.adb('shell', 'settings', 'put', 'secure', 'stylus_handwriting_enabled', '0')
            require(self.adb('shell', 'settings', 'get', 'secure', 'stylus_handwriting_enabled').strip() == '0',
                    'Cannot disable emulator handwriting tutorial')
        print(f'Emulator: {self.serial} ({AVD}); never using a physical device', flush=True)

    def build(self):
        arch = self.adb('shell', 'getprop', 'ro.product.cpu.abi').strip()
        require(arch in ('arm64-v8a', 'x86_64'), 'Unsupported emulator architecture')
        # Always ask Gradle to validate inputs; its incremental cache avoids stale APK reuse.
        proc = self.spawn(['./gradlew', ':app:assembleDebug', f'-PreactNativeArchitectures={arch}',
                           '-Pandroid.builder.sdkDownload=false', '--offline', '--no-daemon'], 'gradle', MOBILE / 'android')
        require(proc.wait(timeout=900) == 0, 'Local debug build failed; see gradle.log. No SDK/dependency auto-install.')
        self.apk = MOBILE / 'android/app/build/outputs/apk/debug/app-debug.apk'
        aapt = sorted((self.sdk / 'build-tools').glob('*/aapt'))[-1]
        badging = self.cmd([aapt, 'dump', 'badging', self.apk])
        require(f"package: name='{APP_ID}'" in badging and 'application-debuggable' in badging, 'Not a local debuggable DeDato APK')
        with zipfile.ZipFile(self.apk) as archive:
            require('assets/index.android.bundle' not in archive.namelist(), 'Unexpected embedded bundle; refusing unknown API provenance')
        self.adb('install', '-r', str(self.apk))  # no uninstall of unrelated app/data
        print('Local assembleDebug APK validated and installed (Gradle incremental)', flush=True)

    def backend(self):
        require_free_port(8000)
        self.env['DATABASE_URL'] = 'sqlite:///' + str(self.run_dir / 'e2e.db')
        self.env['PYTHONPATH'] = str(ROOT / 'backend')
        # cwd has no .env: pydantic cannot read repository/provider settings.
        config = self.run_dir / 'uvicorn-logging.json'
        config.write_text(json.dumps({'version': 1, 'disable_existing_loggers': False,
            'formatters': {'timestamped': {'format': '%(asctime)s %(levelname)s %(name)s %(message)s'}},
            'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'timestamped', 'stream': 'ext://sys.stderr'}},
            'root': {'handlers': ['console'], 'level': 'INFO'},
            'loggers': {name: {'handlers': [], 'propagate': True, 'level': 'INFO'}
                        for name in ('uvicorn', 'uvicorn.error', 'uvicorn.access')}}))
        proc = self.spawn([self.python, '-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000',
                           '--log-config', str(config)], 'backend', self.run_dir)
        self.wait(lambda: http(BACKEND + '/health'), 'backend health', process=proc)
        body = http(BACKEND + '/api/dev/e2e/seed', b'{"reset":true}', {'Content-Type': 'application/json'})
        (self.run_dir / 'seed.json').write_bytes(body)
        with sqlite3.connect(self.run_dir / 'e2e.db') as db:
            tables = db.execute("select count(*) from sqlite_master where type='table'").fetchone()[0]
        print(f'Disposable DB: {self.run_dir}/e2e.db; seed HTTP 200; tables={tables}', flush=True)

    def metro(self):
        require_free_port(8081)
        proc = self.spawn([MOBILE / 'node_modules/.bin/expo', 'start', '--dev-client', '--localhost', '--port', '8081', '--clear'], 'metro', MOBILE)
        self.wait(lambda: http(METRO + '/status') == b'packager-status:running', 'Metro', process=proc)
        manifest = json.loads(http(METRO + '/', headers={'expo-platform': 'android', 'accept': 'application/expo+json'}, timeout=120))
        config = manifest['extra']['expoClient']
        require(config['extra']['API_URL'] == API and config['extra']['WEB_URL'] == self.env['WEB_URL'], 'Metro effective URLs not local')
        # Finish cold JS compilation before the UI readiness deadline starts.
        # Fetch only the owned Metro launch asset, never a provider/store bundle.
        bundle_url = manifest['launchAsset']['url']
        require(bundle_url.startswith(METRO + '/'), 'Non-local Metro bundle refused')
        require(bool(http(bundle_url, timeout=120)), 'Empty local Metro bundle')
        reverse = self.adb('reverse', '--list')
        mappings = [line.split() for line in reverse.splitlines() if 'tcp:8081' in line.split()]
        require(not mappings or all(line[-2:] == ['tcp:8081', 'tcp:8081'] for line in mappings), 'Conflicting adb reverse mapping')
        if not mappings:
            self.adb('reverse', 'tcp:8081', 'tcp:8081')
            self.reverse_added = True
        print(f'Metro ready: {METRO}; effective API_URL={API}', flush=True)

    def tests(self):
        packages = self.adb('shell', 'pm', 'list', 'packages', '-U', APP_ID)
        uid = re.search(rf'^package:{re.escape(APP_ID)} uid:(\d+)$', packages, re.MULTILINE)
        require(uid is not None, 'Cannot scope runtime logs to the installed DeDato app')
        # RN 0.81 emits JS console evidence to device logcat, not Metro stdout.
        # Begin at device time now; do not clear or reuse historical device logs.
        since = self.adb('shell', 'date', '+%m-%dT%H:%M:%S.000').strip().replace('T', ' ')
        self.spawn(['adb', '-s', self.serial, 'logcat', '--uid=' + uid[1], '-T', since,
                    '-v', 'threadtime', 'ReactNativeJS:I', '*:S'], 'app-runtime', ROOT)
        args = ['maestro', '--device', self.serial, 'test', '--config', '.maestro/config.yaml',
                '--format', 'JUNIT', '--output', str(self.run_dir / 'junit.xml'),
                '--debug-output', str(self.run_dir / 'debug'), '--test-output-dir', str(self.run_dir / 'output'),
                '--env', f'APP_ID={APP_ID}', '--env', 'E2E_PHONE_DIGITS=9991111111',
                '--env', 'E2E_PASSWORD=e2e123', '--env', f'DEVELOPMENT_CLIENT_URL={LINK}', *self.flows]
        proc = self.spawn(args, 'maestro', MOBILE)
        try:
            result = proc.wait(timeout=900)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            self._record_failure_snapshot()
            raise
        print((self.run_dir / 'maestro.log').read_text(), flush=True)
        self.finish_maestro(result)

    def _record_cleanup_error(self, action, exc=None, description=None):
        if exc is not None:
            row = diagnostic_exc_record(action, exc)
            row['action'] = row.pop('name')
        else:
            row = {'action': action, 'status': 'error', 'error_type': None,
                   'errno': None, 'os_error': None, 'description': description or 'error'}
        self.cleanup_errors.append(row)
        detail = row.get('error_type') or row.get('description') or 'error'
        print(f'WARN: cleanup {action} ({detail})', flush=True)

    def _write_cleanup_errors(self):
        folder = getattr(self, 'run_dir', None)
        if folder is None or not self.cleanup_errors:
            return
        try:
            (folder / 'cleanup-errors.json').write_text(
                json.dumps({'errors': self.cleanup_errors, **stamp()}, indent=2, default=str))
        except OSError as exc:
            print(f'WARN: cleanup-errors.json not written ({type(exc).__name__})', flush=True)

    def _stop_owned_child(self, proc):
        # Only this harness's start_new_session children. Never unknown PIDs.
        try:
            if proc.poll() is not None:
                return
        except OSError as exc:
            self._record_cleanup_error('poll_child', exc)
            return
        for name, child in getattr(self, 'processes', {}).items():
            if child is proc:
                try:
                    self.event('cleanup_signal', name, child, signal=int(signal.SIGTERM))
                except OSError as exc:
                    self._record_cleanup_error('cleanup_signal', exc)
                break
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        except OSError as exc:
            self._record_cleanup_error('terminate_child', exc)
            return
        try:
            proc.wait(timeout=10)
            return
        except subprocess.TimeoutExpired:
            pass
        except OSError as exc:
            self._record_cleanup_error('wait_child', exc)
            return
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            return
        except OSError as exc:
            self._record_cleanup_error('kill_child', exc)
            return
        try:
            proc.wait(timeout=5)
        except (subprocess.TimeoutExpired, OSError) as exc:
            self._record_cleanup_error('wait_child', exc)

    def cleanup(self):
        # Best-effort per action. Never raises; callers keep the primary outcome.
        self.cleanup_errors = []
        if self.handwriting_before is not None:
            action = ['delete', 'secure', 'stylus_handwriting_enabled'] if self.handwriting_before == 'null' else [
                'put', 'secure', 'stylus_handwriting_enabled', self.handwriting_before]
            try:
                self.adb('shell', 'settings', *action)
                restored = self.adb('shell', 'settings', 'get', 'secure', 'stylus_handwriting_enabled').strip()
                if restored != self.handwriting_before:
                    self._record_cleanup_error('restore_handwriting', description='restore_mismatch')
            except (OSError, subprocess.SubprocessError) as exc:
                self._record_cleanup_error('restore_handwriting', exc)
        if self.reverse_added:
            try:
                self.adb('reverse', '--remove', 'tcp:8081')
            except (OSError, subprocess.SubprocessError) as exc:
                self._record_cleanup_error('remove_adb_reverse', exc)
        for proc in reversed(self.children):
            self._stop_owned_child(proc)
        for name in list(getattr(self, 'processes', {})):
            try:
                self.process_status(name)
            except (OSError, subprocess.SubprocessError) as exc:
                self._record_cleanup_error('process_status', exc)
        for log in self.logs:
            try:
                log.close()
            except OSError as exc:
                self._record_cleanup_error('close_log', exc)
        self._write_cleanup_errors()
        return self.cleanup_errors

    def run(self):
        for port in (8000, 8081):
            require_free_port(port)
        self.tools()
        self.emulator()
        self.build()
        self.backend()
        self.metro()
        self.tests()


def main():
    harness = None
    primary = None
    try:
        verify_repository()
        flows = sys.argv[1:] or FLOWS
        validate_inputs(os.environ, flows)
        branch = subprocess.check_output(['git', 'branch', '--show-current'], cwd=ROOT, text=True).strip()
        require(branch == 'main', 'Expected canonical main; no checkout/reset/stash performed')
        print(subprocess.check_output(['git', 'status', '-sb'], cwd=ROOT, text=True).strip(), flush=True)
        harness = Harness(flows)
        def interrupted(signum, frame):
            raise KeyboardInterrupt()
        signal.signal(signal.SIGTERM, interrupted)
        harness.run()
    except (RuntimeError, OSError, subprocess.SubprocessError, KeyboardInterrupt) as exc:
        primary = exc
        print(f'ERROR: {exc}', file=sys.stderr, flush=True)
    cleanup_errors = []
    if harness is not None:
        try:
            cleanup_errors = harness.cleanup() or []
        except Exception as exc:
            row = diagnostic_exc_record('cleanup', exc)
            row['action'] = row.pop('name')
            cleanup_errors = [row]
            print(f'WARN: cleanup incomplete ({type(exc).__name__})', flush=True)
            try:
                harness.cleanup_errors = cleanup_errors
                harness._write_cleanup_errors()
            except Exception:
                pass
    if cleanup_errors:
        print(f'ERROR: cleanup failed ({len(cleanup_errors)} action(s))', file=sys.stderr, flush=True)
        for row in cleanup_errors:
            detail = row.get('error_type') or row.get('description') or 'error'
            print(f'ERROR: cleanup {row.get("action")}: {detail}', file=sys.stderr, flush=True)
    if primary is not None:
        return 1
    if cleanup_errors:
        return 1
    print('ANDROID MAESTRO GATE PASS', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
