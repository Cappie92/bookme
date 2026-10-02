#!/usr/bin/env python3
"""Local-only iOS Maestro gate. Isolated owned simulator. No store/EAS/device reuse."""
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
import os
from pathlib import Path
import plistlib
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
import uuid

ROOT = Path(__file__).resolve().parents[1]
MOBILE = ROOT / 'mobile'
IOS = MOBILE / 'ios'
WORKSPACE = IOS / 'DeDato.xcworkspace'
SCHEME = 'DeDato'
APP_ID = 'com.dedato.app'
API = 'http://127.0.0.1:8000'
BACKEND = 'http://127.0.0.1:8000'
METRO = 'http://127.0.0.1:8081'
WEB = 'http://127.0.0.1:5173'
LINK = 'dedato://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
FLOWS = [f'.maestro/flows/{name}.yaml' for name in (
    '01-login-success', '02-login-error', '03-navigate-to-bookings',
    '04-open-booking-details', '05-logout')]
OWNED_SIM_PREFIX = 'DeDato-Maestro-'
UDID_RE = re.compile(r'^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$')


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def verify_repository():
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
    raise RuntimeError('No compatible installed tool found; select Node 20.19.4 / Java 17 / Xcode manually')


def validate_inputs(env, flows):
    for key, expected in {
        'API_URL': API, 'EXPO_PUBLIC_API_URL': API, 'E2E_BACKEND_URL': BACKEND,
        'WEB_URL': WEB, 'EXPO_PUBLIC_WEB_URL': WEB, 'APP_ID': APP_ID,
        'E2E_PHONE_DIGITS': '9991111111', 'E2E_PASSWORD': 'e2e123',
    }.items():
        require(not env.get(key) or env[key] == expected, f'Unsafe/unsupported override: {key}')
    for key in ('API_URL', 'API_URL_ANDROID', 'EXPO_PUBLIC_API_URL', 'E2E_BACKEND_URL', 'WEB_URL'):
        value = env.get(key) or ''
        require('10.0.2.2' not in value, f'{key} is Android-only; iOS uses 127.0.0.1')
        require('dedato.ru' not in value.lower(), f'{key} must not target production/staging')
    require(env.get('ENVIRONMENT', 'development').lower() != 'production', 'Production forbidden')
    for key in ('DATABASE_URL', 'E2E_DATABASE_PATH', 'MAESTRO_ALLOW_PRODUCTION_BACKEND',
                'MAESTRO_ALLOW_EXPO_GO'):
        require(not env.get(key), f'{key} must be unset; harness owns disposable targets')
    require(all(flow in FLOWS for flow in flows), 'Only the five reviewed release-gate flows are allowed')


def local_env(source):
    env = {k: source[k] for k in ('HOME', 'USER', 'LOGNAME', 'PATH', 'LANG', 'TMPDIR') if k in source}
    env.update({
        'LANG': 'en_US.UTF-8', 'CI': '1', 'EXPO_NO_TELEMETRY': '1', 'EXPO_NO_DOTENV': '1',
        'EXPO_OFFLINE': '1',
        'API_URL': API, 'EXPO_PUBLIC_API_URL': API,
        'WEB_URL': WEB, 'EXPO_PUBLIC_WEB_URL': WEB,
        'APP_UNIVERSAL_LINK_HOSTS': 'localhost', 'PUBLIC_APP_LINK_ORIGIN': WEB,
        'EXTRA_UNIVERSAL_LINK_HOSTS': '', 'YANDEX_MOBILE_AUTH_VISIBLE': '0',
        'EXPO_PUBLIC_YANDEX_MOBILE_AUTH_VISIBLE': '0',
        'EXPO_PUBLIC_APPMETRICA_API_KEY': '', 'APPMETRICA_API_KEY': '',
        'EXPO_PUBLIC_APPMETRICA_TEST_EVENT_ENABLED': 'false',
        'ENVIRONMENT': 'development', 'DEV_E2E': 'true', 'ZVONOK_MODE': 'stub',
        'ROBOKASSA_MODE': 'stub', 'EMAIL_ENABLED': 'false', 'APPLE_IAP_ENABLED': 'false',
        'YANDEX_AUTH_ENABLED': 'false', 'PUSH_NOTIFICATIONS_ENABLED': 'false',
        'PUSH_REGISTRATION_ENABLED': 'false', 'PUSH_NOTIFICATION_USER_ALLOWLIST': '',
        'ENABLE_DEV_TESTDATA': '', 'FRONTEND_URL': WEB, 'API_BASE_URL': BACKEND,
        'PYTHONDONTWRITEBYTECODE': '1', 'MAESTRO_CLI_NO_ANALYTICS': '1',
    })
    for key in ('DEBUG_HTTP', 'DEBUG_AUTH', 'DEBUG_FEATURES', 'DEBUG_MENU', 'DEBUG_DASHBOARD',
                'DEBUG_LOGS', 'DEBUG_MOBILE_ERRORS', 'DEBUG_AUTH_TRACE'):
        env[key] = '0'
    return env


def require_free_port(port):
    with socket.socket() as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('127.0.0.1', port))
        except OSError:
            raise RuntimeError(f'Port {port} occupied; stop its owner manually. No process was killed.')


def http(url, data=None, headers=None, timeout=3):
    require(url.startswith(BACKEND + '/') or url.startswith(METRO + '/'), 'Non-local HTTP refused')
    request = urllib.request.Request(url, data=data, headers=headers or {})
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None
    with urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect()).open(request, timeout=timeout) as r:
        require(r.status == 200, 'Expected HTTP 200')
        return r.read()


def verify_runtime_api(log, flow_count):
    urls = re.findall(r"Effective API_URL \(axios baseURL\):['\", ]+(https?://[^\s'\",]+)", log)
    require(len(urls) >= flow_count and set(urls) == {API}, 'Missing/non-local runtime API evidence')


API_EVIDENCE_PATTERN = re.compile(
    r"Effective API_URL \(axios baseURL\):['\", ]+(https?://[^\s'\",]+)")


@dataclass(frozen=True)
class LogContinuityBoundary:
    st_dev: int
    st_ino: int
    size: int
    prefix_digest: bytes


def _read_exact(fd, size):
    os.lseek(fd, 0, os.SEEK_SET)
    buf = bytearray()
    while len(buf) < size:
        chunk = os.read(fd, size - len(buf))
        if not chunk:
            break
        buf += chunk
    return bytes(buf)


class AppRuntimeLog:
    """Bytes and identity come from one open descriptor, not a later pathname stat."""

    def __init__(self, path):
        self.path = Path(path)
        self.closed = False
        self._fd = os.open(self.path, os.O_RDONLY)
        try:
            st = os.fstat(self._fd)
            prefix = _read_exact(self._fd, st.st_size)
            require(len(prefix) == st.st_size, 'App runtime log prefix read was short')
            self.boundary = LogContinuityBoundary(
                st.st_dev, st.st_ino, st.st_size, hashlib.sha256(prefix).digest())
        except Exception:
            self.close()
            raise

    def close(self):
        if self.closed:
            return
        self.closed = True
        os.close(self._fd)

    def read_suffix(self) -> bytes:
        st = os.fstat(self._fd)
        require(st.st_dev == self.boundary.st_dev and st.st_ino == self.boundary.st_ino,
                'App runtime log descriptor identity changed; continuity not proven')
        require(st.st_size >= self.boundary.size, 'App runtime log was truncated; continuity not proven')
        prefix = _read_exact(self._fd, self.boundary.size)
        require(hashlib.sha256(prefix).digest() == self.boundary.prefix_digest,
                'App runtime log prefix changed; continuity not proven')
        os.lseek(self._fd, self.boundary.size, os.SEEK_SET)
        suffix = bytearray()
        chunk = os.read(self._fd, 65536)
        while chunk:
            suffix += chunk
            chunk = os.read(self._fd, 65536)
        try:
            current = self.path.stat()
        except FileNotFoundError as exc:
            raise RuntimeError('App runtime log disappeared from pathname') from exc
        require(current.st_dev == st.st_dev and current.st_ino == st.st_ino,
                'App runtime log pathname identity changed; continuity not proven')
        return bytes(suffix)


def iter_complete_log_record_bytes(suffix: bytes):
    if not suffix:
        return
    end = len(suffix)
    if not suffix.endswith(b'\n'):
        end = suffix.rfind(b'\n') + 1
        if end == 0:
            return
    chunk = suffix[:end]
    start = 0
    while start < len(chunk):
        newline = chunk.find(b'\n', start)
        if newline == -1:
            break
        yield chunk[start:newline + 1]
        start = newline + 1


def normalize_log_timestamp(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        parsed = datetime.fromisoformat(text.replace('Z', '+00:00'))
    except ValueError:
        parsed = None
        for fmt in ('%Y-%m-%d %H:%M:%S.%f%z', '%Y-%m-%d %H:%M:%S%z'):
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_unified_log_record(line: str) -> dict:
    text = line.strip()
    if not text:
        return {}
    try:
        payload = json.loads(text)
    except json.JSONDecodeError as exc:
        raise RuntimeError('Malformed app runtime log record') from exc
    require(isinstance(payload, dict), 'Malformed app runtime log record')
    return payload


def log_record_process_id(record: dict):
    if 'processID' not in record or record.get('processID') is None:
        return None
    return int(record['processID'])


def log_record_message(record: dict) -> str:
    value = record.get('eventMessage')
    return '' if value is None else str(value)


def parse_exact_dedato_pids(stdout: str):
    found = []
    for line in stdout.splitlines():
        match = re.match(r'^\s*(\d+)\s+(\S+)\s*$', line)
        if match and Path(match.group(2)).name == 'DeDato':
            found.append(int(match.group(1)))
    return found


def verify_ios_per_flow_api_evidence(suffix: bytes, pid: int, launch_wall: datetime) -> None:
    wall = launch_wall if launch_wall.tzinfo else launch_wall.replace(tzinfo=timezone.utc)
    matched = False
    try:
        for raw in iter_complete_log_record_bytes(suffix):
            text = raw.decode('utf-8')
            record = parse_unified_log_record(text)
            if record.get('finished') is True and 'eventMessage' not in record:
                continue
            message = log_record_message(record)
            found = API_EVIDENCE_PATTERN.search(message)
            if not found:
                continue
            require(found.group(1) == API, 'Non-local runtime API evidence')
            record_pid = log_record_process_id(record)
            require(record_pid is not None and record_pid == pid,
                    'Runtime API evidence process identity mismatch')
            timestamp = normalize_log_timestamp(record.get('timestamp'))
            require(timestamp is not None and timestamp >= wall,
                    'Runtime API evidence timestamp before current launch')
            matched = True
            break
    except UnicodeDecodeError as exc:
        raise RuntimeError('Malformed app runtime log record') from exc
    require(matched, 'Missing/non-local runtime API evidence for current launch')


def stamp():
    return {'wall': datetime.now(timezone.utc).isoformat(), 'monotonic': time.monotonic()}


def diagnostic_exc_record(name, exc):
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
    start = stamp()
    try:
        result = {'ok': True, 'value': check()}
    except Exception as exc:
        result = {'ok': False, **diagnostic_exc_record('observe', exc),
                  'http_status': getattr(exc, 'code', None)}
    return {**start, **result, 'end_monotonic': time.monotonic()}


def version_tuple(text):
    parts = [int(p) for p in re.findall(r'\d+', text or '')]
    return tuple(parts[:4]) if parts else (0,)


def available_ios_runtimes(payload):
    found = []
    for runtime in payload.get('runtimes') or []:
        if not runtime.get('isAvailable'):
            continue
        name = runtime.get('name') or ''
        identifier = runtime.get('identifier') or ''
        blob = f'{name} {identifier}'.lower()
        if any(token in blob for token in ('watchos', 'tvos', 'xros', 'visionos')):
            continue
        if 'ios' not in blob:
            continue
        found.append({
            'name': name,
            'identifier': identifier,
            'version': runtime.get('version') or '',
        })
    require(found, 'No compatible iOS Simulator runtime is installed; install one in Xcode. No runtime download was attempted.')
    found.sort(key=lambda item: version_tuple(item['version'] or item['identifier']), reverse=True)
    return found


def available_iphone_devicetypes(payload):
    found = []
    for item in payload.get('devicetypes') or []:
        name = item.get('name') or ''
        identifier = item.get('identifier') or ''
        if 'iPhone' not in name:
            continue
        if any(token in name for token in ('iPad', 'Watch', 'iPod', 'Apple TV', 'Reality')):
            continue
        found.append({'name': name, 'identifier': identifier})
    require(found, 'No compatible iPhone Simulator device type is installed; no auto-download.')
    preferred = [item for item in found if item['name'] == 'iPhone 17 Pro']
    rest = sorted((item for item in found if item['name'] != 'iPhone 17 Pro'),
                  key=lambda item: version_tuple(item['name']), reverse=True)
    return preferred + rest


def device_record(payload, udid):
    require(isinstance(payload, dict) and isinstance(payload.get('devices'), dict),
            'Malformed simctl devices map')
    matches = []
    for runtime, runtime_devices in payload['devices'].items():
        require(isinstance(runtime, str) and isinstance(runtime_devices, list),
                'Malformed simctl runtime device list')
        for device in runtime_devices:
            require(isinstance(device, dict) and isinstance(device.get('udid'), str)
                    and UDID_RE.fullmatch(device['udid']), 'Malformed simctl device record')
            if isinstance(udid, str) and device['udid'].casefold() == udid.casefold():
                matches.append(device)
    require(len(matches) <= 1, 'Ambiguous simulator identity: duplicate UDID')
    if not matches:
        return None
    record = matches[0]
    require(isinstance(record.get('name'), str) and bool(record['name']),
            'Missing simulator name')
    require(type(record.get('isAvailable')) is bool, 'Missing/malformed simulator availability')
    require(record.get('state') in ('Booted', 'Shutdown', 'Booting', 'Shutting Down'),
            'Missing/malformed simulator state')
    return record


class Harness:
    def __init__(self, flows):
        require(sys.platform == 'darwin', 'iOS Maestro gate requires macOS with Xcode')
        self.flows = flows
        self.children = []
        self.logs = []
        self.processes = {}
        self.exit_seen = set()
        self.udid = None
        self.owned_udid = None
        self.owned_name = None
        self.runtime_id = None
        self.device_type_id = None
        self.app = None
        self.current_flow = None
        self.cleanup_errors = []
        self.secondary_errors = []
        self.run_dir = Path(tempfile.mkdtemp(prefix='dedato-maestro-', dir='/private/tmp'))
        self.env = local_env(os.environ)
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
            return {'present': False, 'pids': [],
                    **{k: result[k] for k in ('name', 'status', 'error_type', 'errno',
                                              'os_error', 'description') if k in result}}
        require(result.get('returncode') in (0, 1) and not result.get('stderr'), 'Listener inspection failed')
        pids = [int(line[1:]) for line in result.get('stdout', '').splitlines() if line.startswith('p')]
        return {'present': bool(pids), 'pids': pids}

    def host_tcp(self):
        with socket.create_connection(('127.0.0.1', 8000), timeout=0.5):
            return 'connected'

    def simctl_result(self, *args, timeout=120):
        return subprocess.run(['xcrun', 'simctl', *[str(a) for a in args]], cwd=ROOT, env=self.env,
                              text=True, capture_output=True, timeout=timeout)

    def simctl(self, *args, check=True, timeout=120):
        result = self.simctl_result(*args, timeout=timeout)
        if check and result.returncode != 0:
            raise RuntimeError(f'simctl {args[0]} failed; see retained artifacts')
        return result.stdout

    def simctl_json(self, *args):
        try:
            payload = json.loads(self.simctl(*args, '--json'))
        except (ValueError, TypeError) as exc:
            raise RuntimeError('Malformed simctl JSON') from exc
        require(isinstance(payload, dict), 'Malformed simctl JSON root')
        return payload

    def require_owned_simulator(self):
        require(isinstance(self.owned_udid, str) and UDID_RE.fullmatch(self.owned_udid),
                'No owned simulator; refusing destructive reset')
        require(self.udid == self.owned_udid, 'Active simulator is not the owned DeDato simulator')
        require(self.owned_name and self.owned_name.startswith(OWNED_SIM_PREFIX),
                'Owned simulator name is missing or not a DeDato Maestro device')
        record = device_record(self.simctl_json('list', 'devices'), self.owned_udid)
        require(record is not None, 'Owned simulator UDID is not present in simctl list')
        require(record.get('udid') == self.owned_udid, 'Simulator UDID mismatch')
        require(record.get('name') == self.owned_name, 'Simulator name mismatch; refusing destructive reset')
        require(record['isAvailable'] is True, 'Owned simulator is not available')
        return record

    def installed_apps(self):
        # simctl listapps returns a plist; absence is established from its complete map,
        # never guessed from an arbitrary uninstall error string.
        output = self.simctl('listapps', self.owned_udid)
        try:
            # Accept simctl's OpenStep plist as well as XML/JSON without an ad-hoc parser.
            converted = subprocess.run(['/usr/bin/plutil', '-convert', 'json', '-o', '-', '-'],
                                       input=output, env=self.env, cwd=ROOT, text=True,
                                       capture_output=True, timeout=10, check=True)
            apps = json.loads(converted.stdout)
        except (ValueError, TypeError, OSError, subprocess.SubprocessError) as exc:
            raise RuntimeError('Malformed simctl installed-app map') from exc
        require(isinstance(apps, dict) and all(isinstance(k, str) and isinstance(v, dict)
                                             for k, v in apps.items()),
                'Malformed simctl installed-app map')
        return apps

    def terminate_installed_app(self):
        result = self.simctl_result('terminate', self.owned_udid, APP_ID)
        if result.returncode == 0:
            return
        # Narrow CoreSimulator missing-process response, including its domain/code.
        # Unknown OS wording or a different error chain fails closed.
        errors = re.findall(r'\(domain=([^,()]+), code=(-?\d+)\)', result.stderr)
        missing_process = (result.returncode == 3 and errors
                           and all(pair == ('NSPOSIXErrorDomain', '3') for pair in errors)
                           and ('found nothing to terminate' in result.stderr
                                or ('Application termination failed' in result.stderr
                                    and 'No such process' in result.stderr)))
        require(missing_process, 'simctl terminate failed; clean reset not proven')

    def reset_owned_session(self):
        # Destructive keychain/app reset is allowed only on the simulator this run created.
        record = self.require_owned_simulator()
        require(record['state'] == 'Booted', 'Owned simulator must be booted before reset')
        installed = APP_ID in self.installed_apps()
        if installed:
            self.terminate_installed_app()
        self.simctl('keychain', self.owned_udid, 'reset')
        if installed:
            self.simctl('uninstall', self.owned_udid, APP_ID)
        require(APP_ID not in self.installed_apps(), 'App remains installed; clean reset not proven')
        require(self.app is not None and Path(self.app).is_dir(), 'Validated .app missing; refusing install')
        self.simctl('install', self.owned_udid, str(self.app))

    def wait_for_exact_dedato_pid(self, timeout=20):
        # Bounded poll for the process Maestro actually launched. Never the first substring hit.
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            result = self.simctl_result('spawn', self.owned_udid, 'ps', '-A', '-o', 'pid=,comm=')
            require(result.returncode == 0,
                    f'DeDato process inspection failed (exit {result.returncode})')
            pids = parse_exact_dedato_pids(result.stdout)
            require(len(pids) <= 1, 'Multiple DeDato processes; refusing to guess')
            if len(pids) == 1:
                return pids[0]
            time.sleep(0.2)
        raise RuntimeError('Timed out waiting for exactly one DeDato process')

    def diagnostic_sample(self):
        row = {**stamp()}
        row['backend'] = observe(lambda: self.process_status('backend'))
        row['metro'] = observe(lambda: self.process_status('metro'))
        row['listener_8000'] = observe(lambda: self.listener(8000))
        backend = row['backend'].get('value') or {}
        listener = row['listener_8000'].get('value') or {}
        owned = (row['backend'].get('ok') is True and backend.get('poll') is None
                 and listener.get('pids') == [backend.get('pid')])
        row['host_tcp'] = observe(self.host_tcp) if owned else {'skipped': 'no_verified_owned_listener'}
        row['host_health'] = observe(lambda: (http(BACKEND + '/health', timeout=0.5), 200)[1]) if owned else {'skipped': 'no_verified_owned_listener'}
        row['simulator'] = observe(lambda: device_record(self.simctl_json('list', 'devices'), self.owned_udid) or {})
        row['end'] = stamp()
        return row

    def failure_snapshot(self):
        snapshot = {**stamp(), 'udid': self.owned_udid, 'simulator_name': self.owned_name,
                    'app': str(self.app) if self.app else None}
        sample = observe(self.diagnostic_sample)
        if sample.get('ok') and isinstance(sample.get('value'), dict):
            snapshot.update(sample['value'])
        else:
            snapshot['diagnostic_sample'] = sample
        snapshot['listener_8081'] = observe(lambda: self.listener(8081))
        pids = ','.join(str(p.pid) for p in self.processes.values())
        snapshot['owned_ps'] = observe(lambda: self.diagnostic_command(
            ['ps', '-p', pids, '-o', 'pid,ppid,pgid,lstart,etime,state,comm']))
        if self.owned_udid:
            snapshot['screenshot'] = observe(lambda: self.simctl(
                'io', self.owned_udid, 'screenshot', str(self.run_dir / 'failure-screenshot.png')))
            snapshot['app_container'] = observe(lambda: self.simctl(
                'get_app_container', self.owned_udid, APP_ID, check=False))
        try:
            (self.run_dir / 'failure-snapshot.json').write_text(json.dumps(snapshot, indent=2, default=str))
        except OSError as exc:
            print(f'WARN: failure-snapshot.json not written ({type(exc).__name__})', flush=True)
        maestro_name = ('maestro-' + Path(self.current_flow).stem
                        if getattr(self, 'current_flow', None) else 'maestro')
        for name in ('backend', 'metro', 'app-runtime', maestro_name):
            try:
                source = self.run_dir / f'{name}.log'
                text = source.read_text() if source.exists() else ''
                (self.run_dir / f'failure-{name}-tail.log').write_text(''.join(text.splitlines(True)[-100:]))
            except OSError:
                pass

    def _record_failure_snapshot(self):
        try:
            self.failure_snapshot()
        except Exception as exc:
            print(f'WARN: failure snapshot incomplete ({type(exc).__name__})', flush=True)

    def _record_secondary(self, action, exc):
        if not hasattr(self, 'secondary_errors'):
            self.secondary_errors = []
        row = diagnostic_exc_record(action, exc)
        row['action'] = row.pop('name')
        self.secondary_errors.append(row)
        print(f'WARN: diagnostic {action} ({row.get("error_type")})', flush=True)
        folder = getattr(self, 'run_dir', None)
        if folder is None:
            return
        try:
            (folder / 'secondary-errors.json').write_text(
                json.dumps({'errors': self.secondary_errors, **stamp()}, indent=2, default=str))
        except OSError:
            print('WARN: secondary-errors.json not written (OSError)', flush=True)

    def app_runtime_log_text(self):
        path = self.run_dir / 'app-runtime.log'
        return path.read_text() if path.exists() else ''

    def _print_maestro_log(self, name):
        path = self.run_dir / f'{name}.log'
        if path.exists():
            print(path.read_text(), flush=True)

    def finish_maestro(self, result):
        name = ('maestro-' + Path(self.current_flow).stem
                if getattr(self, 'current_flow', None) else 'maestro')
        # Non-zero exit is primary before any diagnostic read can replace it.
        primary = (RuntimeError(f'Maestro failed (exit {result}); artifacts retained')
                   if result != 0 else None)
        try:
            (self.run_dir / f'{name}.exitcode').write_text(str(result))
        except OSError as exc:
            self._record_secondary('write_maestro_exitcode', exc)
            if primary is None:
                raise
        log = ''
        try:
            self._print_maestro_log(name)
        except (OSError, UnicodeError) as exc:
            self._record_secondary('read_maestro_log', exc)
            if primary is None:
                raise
        try:
            log = self.app_runtime_log_text()
        except (OSError, UnicodeError) as exc:
            self._record_secondary('read_app_runtime_log', exc)
            if primary is None:
                raise
            log = ''
        network_failure = ('ERR_NETWORK' in log or 'Failed to connect to 127.0.0.1:8000' in log)
        if primary is not None or network_failure:
            try:
                self._record_failure_snapshot()
            except Exception as exc:
                self._record_secondary('failure_snapshot', exc)
                if primary is None:
                    raise
        if primary is not None:
            raise primary
        require(not network_failure, 'Runtime ERR_NETWORK observed; no further gate/retry')

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
            time.sleep(1)
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
        java_home = re.search(r'^\s*java\.home = (.+)$', version.stderr, re.MULTILINE)
        require(java_home is not None, f'Cannot determine Java home from {java_bin}')
        java = Path(java_home[1].strip())
        self.env.update(JAVA_HOME=str(java))
        self.env['PATH'] = os.pathsep.join(map(str, [node.parent, java / 'bin', home / '.maestro/bin'])) + os.pathsep + self.env['PATH']
        for tool in ('node', 'java', 'maestro', 'lsof', 'xcrun', 'xcodebuild'):
            require(shutil.which(tool, path=self.env['PATH']), f'Missing {tool}; install manually')
        require(self.cmd(['node', '--version']).strip() == 'v20.19.4', 'Node 20.19.4 required')
        java_ver = subprocess.run(['java', '-version'], env=self.env, capture_output=True, text=True, check=True)
        require(re.search(r'version "17\.', java_ver.stderr), 'Java 17 required')
        jvm_home = self.run_dir / 'jvm'
        jvm_home.mkdir()
        (jvm_home / '.maestro').symlink_to(home / '.maestro', target_is_directory=True)
        self.env['MAESTRO_OPTS'] = f'-Duser.home={jvm_home} -Djava.awt.headless=true'
        expected = (MOBILE / '.maestro/MAESTRO_VERSION').read_text().strip()
        require(self.cmd(['maestro', '--version']).strip() == expected, f'Maestro {expected} required')
        self.python = ROOT / 'backend/.venv/bin/python'
        require(self.python.exists() and (MOBILE / 'node_modules/.bin/expo').exists(),
                'Install locked dependencies/venv manually first')
        require(WORKSPACE.exists(), 'Missing DeDato.xcworkspace')
        print(f'Toolchain: Node 20.19.4 / Java 17 / Maestro {expected}', flush=True)

    def select_simulator_recipe(self):
        runtimes = available_ios_runtimes(self.simctl_json('list', 'runtimes'))
        types = available_iphone_devicetypes(self.simctl_json('list', 'devicetypes'))
        self.runtime_id = runtimes[0]['identifier']
        self.device_type_id = types[0]['identifier']
        (self.run_dir / 'simulator-recipe.json').write_text(json.dumps({
            'runtime': runtimes[0], 'devicetypes': types[:5],
        }, indent=2))
        print(f'Simulator runtime: {runtimes[0]["name"]}; device type: {types[0]["name"]}', flush=True)
        return types

    def create_owned_simulator(self):
        types = self.select_simulator_recipe()
        name = OWNED_SIM_PREFIX + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + uuid.uuid4().hex[:8]
        last_error = 'simctl create failed'
        for device in types:
            try:
                udid = self.simctl('create', name, device['identifier'], self.runtime_id).strip()
            except RuntimeError as exc:
                last_error = str(exc)
                continue
            require(UDID_RE.fullmatch(udid), 'simctl create did not return a simulator UDID')
            self.owned_name = name
            self.owned_udid = udid
            self.udid = udid
            self.device_type_id = device['identifier']
            (self.run_dir / 'owned-simulator.json').write_text(json.dumps({
                'name': name, 'udid': udid, 'runtime': self.runtime_id, 'devicetype': device,
            }, indent=2))
            print(f'Owned simulator: {name} ({udid}); never using a physical device or pre-existing simulator', flush=True)
            return
        raise RuntimeError(f'Cannot create owned iPhone simulator with installed runtime; {last_error}')

    def boot_owned_simulator(self):
        self.require_owned_simulator()
        self.simctl('boot', self.owned_udid, check=False)
        self.wait(lambda: (device_record(self.simctl_json('list', 'devices'), self.owned_udid) or {}).get('state') == 'Booted',
                  'owned simulator boot', 180)
        print(f'Owned simulator booted: {self.owned_udid}', flush=True)

    def validate_app(self, app):
        require(app.is_dir() and app.suffix == '.app', 'Expected a simulator .app bundle')
        require('Debug-iphonesimulator' in str(app), 'Refusing non-Debug iphonesimulator product')
        info = plistlib.loads((app / 'Info.plist').read_bytes())
        require(info.get('CFBundleIdentifier') == APP_ID, 'Bundle id is not com.dedato.app')
        require(info.get('DTPlatformName') == 'iphonesimulator', 'Refusing device/iphoneos artifact')
        require('iphonesimulator' in str(info.get('DTSDKName') or ''), 'Refusing non-simulator SDK artifact')
        return info

    def build(self):
        derived = self.run_dir / 'DerivedData'
        args = ['xcrun', 'xcodebuild', '-workspace', str(WORKSPACE), '-scheme', SCHEME,
                '-configuration', 'Debug', '-sdk', 'iphonesimulator',
                '-destination', 'generic/platform=iOS Simulator',
                '-derivedDataPath', str(derived),
                'CODE_SIGNING_ALLOWED=NO', 'build']
        proc = self.spawn(args, 'xcodebuild', IOS)
        require(proc.wait(timeout=900) == 0, 'Local iphonesimulator Debug build failed; see xcodebuild.log')
        app = derived / 'Build/Products/Debug-iphonesimulator/DeDato.app'
        info = self.validate_app(app)
        self.app = app
        (self.run_dir / 'built-app.json').write_text(json.dumps({
            'path': str(app), 'bundle_id': info.get('CFBundleIdentifier'),
            'platform': info.get('DTPlatformName'), 'sdk': info.get('DTSDKName'),
        }, indent=2))
        print(f'Local Debug-iphonesimulator app validated: {app}', flush=True)

    def backend(self):
        require_free_port(8000)
        self.env['DATABASE_URL'] = 'sqlite:///' + str(self.run_dir / 'e2e.db')
        self.env['PYTHONPATH'] = str(ROOT / 'backend')
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
        proc = self.spawn([MOBILE / 'node_modules/.bin/expo', 'start', '--dev-client', '--localhost', '--port', '8081', '--clear'],
                          'metro', MOBILE)
        self.wait(lambda: http(METRO + '/status') == b'packager-status:running', 'Metro', process=proc)
        manifest = json.loads(http(METRO + '/', headers={'expo-platform': 'ios', 'accept': 'application/expo+json'}, timeout=120))
        config = manifest['extra']['expoClient']
        require(config['extra']['API_URL'] == API and config['extra']['WEB_URL'] == WEB, 'Metro effective URLs not local iOS loopback')
        bundle_url = manifest['launchAsset']['url']
        require(bundle_url.startswith(METRO + '/'), 'Non-local Metro bundle refused')
        require(bool(http(bundle_url, timeout=120)), 'Empty local Metro bundle')
        print(f'Metro ready: {METRO}; effective API_URL={API}', flush=True)

    def start_runtime_log(self):
        self.require_owned_simulator()
        self.spawn(['xcrun', 'simctl', 'spawn', self.owned_udid, 'log', 'stream', '--level', 'debug',
                    '--style', 'ndjson', '--predicate',
                    '(process == "DeDato") OR (eventMessage CONTAINS "Effective API_URL")'],
                   'app-runtime', ROOT)

    def run_one_maestro(self, flow):
        stamp_name = Path(flow).stem
        args = ['maestro', '--device', self.owned_udid, 'test', '--config', '.maestro/config.yaml',
                '--format', 'JUNIT', '--output', str(self.run_dir / f'junit-{stamp_name}.xml'),
                '--debug-output', str(self.run_dir / 'debug' / stamp_name),
                '--test-output-dir', str(self.run_dir / 'output' / stamp_name),
                '--env', f'APP_ID={APP_ID}', '--env', 'E2E_PHONE_DIGITS=9991111111',
                '--env', 'E2E_PASSWORD=e2e123', '--env', f'DEVELOPMENT_CLIENT_URL={LINK}', flow]
        proc = self.spawn(args, f'maestro-{stamp_name}', MOBILE)
        try:
            result = proc.wait(timeout=300)
        except (subprocess.TimeoutExpired, KeyboardInterrupt):
            self._record_failure_snapshot()
            raise
        self.finish_maestro(result)

    def tests(self):
        self.start_runtime_log()
        log_path = self.run_dir / 'app-runtime.log'
        for flow in self.flows:
            descriptor = None
            primary = None
            close_error = None
            try:
                self.current_flow = flow
                descriptor = AppRuntimeLog(log_path)
                self.reset_owned_session()
                launch_wall = datetime.now(timezone.utc)
                self.current_launch_wall = launch_wall
                with (self.run_dir / 'launch-boundaries.jsonl').open('a') as log:
                    log.write(json.dumps({'flow': flow, 'wall': launch_wall.isoformat()}) + '\n')
                self.run_one_maestro(flow)
                pid = self.wait_for_exact_dedato_pid()
                suffix = descriptor.read_suffix()
                verify_ios_per_flow_api_evidence(suffix, pid, launch_wall)
            except (RuntimeError, OSError, UnicodeDecodeError, ValueError, subprocess.SubprocessError) as exc:
                primary = exc
                try:
                    self._record_failure_snapshot()
                except Exception as snap_exc:
                    self._record_secondary('failure_snapshot', snap_exc)
            except BaseException as exc:
                primary = exc
            finally:
                if descriptor is not None:
                    try:
                        descriptor.close()
                    except Exception as exc:
                        close_error = exc
                        try:
                            self._record_secondary('close_runtime_log', exc)
                        except Exception:
                            print('WARN: diagnostic close_runtime_log (unrecorded)', flush=True)
            if primary is not None:
                raise primary
            if close_error is not None:
                raise close_error

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
        except OSError:
            print('WARN: cleanup-errors.json not written (OSError)', flush=True)

    def _stop_owned_child(self, proc):
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

    def _cleanup_owned_simulator(self):
        if not self.owned_udid:
            return
        try:
            self.require_owned_simulator()
        except Exception as exc:
            self._record_cleanup_error('identify_owned_simulator', exc)
            return
        try:
            record = self.require_owned_simulator()
            if record['state'] == 'Booted' and APP_ID in self.installed_apps():
                self.terminate_installed_app()
        except Exception as exc:
            self._record_cleanup_error('terminate_app', exc)
        try:
            record = self.require_owned_simulator()
            if record['state'] != 'Shutdown':
                self.simctl('shutdown', self.owned_udid)
        except Exception as exc:
            self._record_cleanup_error('shutdown_simulator', exc)
        try:
            self.require_owned_simulator()
            self.simctl('delete', self.owned_udid)
            self.owned_udid = None
            self.udid = None
        except Exception as exc:
            self._record_cleanup_error('delete_owned_simulator', exc)

    def cleanup(self):
        self.cleanup_errors = []
        try:
            self._cleanup_owned_simulator()
        except Exception as exc:
            self._record_cleanup_error('cleanup_owned_simulator', exc)
        for proc in reversed(self.children):
            try:
                self._stop_owned_child(proc)
            except Exception as exc:
                self._record_cleanup_error('stop_owned_child', exc)
        for name in list(getattr(self, 'processes', {})):
            try:
                self.process_status(name)
            except Exception as exc:
                self._record_cleanup_error('process_status', exc)
        for log in self.logs:
            try:
                log.close()
            except Exception as exc:
                self._record_cleanup_error('close_log', exc)
        self._write_cleanup_errors()
        return self.cleanup_errors

    def run(self):
        for port in (8000, 8081):
            require_free_port(port)
        self.tools()
        self.create_owned_simulator()
        self.boot_owned_simulator()
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
    except (Exception, KeyboardInterrupt) as exc:
        primary = exc
        print(f'ERROR: {exc}', file=sys.stderr, flush=True)
    finally:
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
    print('IOS MAESTRO GATE PASS', flush=True)
    return 0


if __name__ == '__main__':
    sys.exit(main())
