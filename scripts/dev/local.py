#!/usr/bin/env python3
"""One local Dedato stack per checkout. No deploy, Docker, shared DB or credentials.

python3 scripts/dev/local.py [start|status|stop|logs] [--no-open]
Servers outlive the launching terminal; start, status and stop serialize on an OS lock.
logs only prints log paths and does not take the lock or touch state.
Use logs --json for a single JSON object with backend, frontend and launcher paths.
"""
import argparse
import contextlib
import fcntl
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.request import Request, ProxyHandler, build_opener
from urllib.parse import urlparse

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT = SCRIPT_DIR.parents[1]
STATE = ROOT / '.local' / 'dedato'
HTTP = build_opener(ProxyHandler({}))  # localhost must never use an inherited proxy
TIMEOUT = 90


def write_json(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    tmp.chmod(0o600)
    tmp.replace(path)


def read_json(path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {}


def request(url, data=None, token=None, timeout=3):
    parsed = urlparse(url)
    if parsed.scheme != 'http' or parsed.hostname != '127.0.0.1':
        raise RuntimeError('Разрешены только локальные адреса 127.0.0.1.')
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    body = None if data is None else json.dumps(data).encode()
    with HTTP.open(Request(url, data=body, headers=headers), timeout=timeout) as response:
        raw = response.read()
        return json.loads(raw) if 'json' in response.headers.get('Content-Type', '') else raw.decode()


@contextlib.contextmanager
def lock(name, blocking=True):
    with (STATE / name).open('a') as handle:
        fcntl.flock(handle, fcntl.LOCK_EX | (0 if blocking else fcntl.LOCK_NB))
        yield handle


def running():
    try:
        with lock('run.lock', False):
            return False
    except BlockingIOError:
        return True


def controller(action='status'):
    state = read_json(STATE / 'state.json')
    if state.get('root') != str(ROOT) or not state.get('control_url'):
        raise RuntimeError('Локальный запуск ещё не готов.')
    reply = request(state['control_url'] + '/' + action,
                    {} if action == 'stop' else None, state['token'])
    if reply.get('run_id') != state['run_id']:
        raise RuntimeError('Не удалось подтвердить владельца локального окружения.')
    return reply


def clean_env():
    # In particular: do not inherit DATABASE_URL, provider keys, proxies or VITE_*.
    env = {k: os.environ[k] for k in ('PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT') if k in os.environ}
    env.update(PYTHONDONTWRITEBYTECODE='1', PYTHONUNBUFFERED='1', NODE_ENV='development')
    return env


def python_executable():
    candidate = ROOT / 'backend/.venv/bin/python'
    return str(candidate) if candidate.exists() else sys.executable


def preflight():
    node = shutil.which('node')
    if not node or not (ROOT / 'frontend/node_modules/vite/dist/node/index.js').exists():
        raise RuntimeError('Не найдены Node/Vite. Установите зависимости frontend (npm ci).')
    result = subprocess.run([python_executable(), '-c', 'import uvicorn,fastapi,sqlalchemy,pydantic_settings'],
                            env=clean_env(), capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError('Не готовы Python-зависимости backend/.venv. Установите backend/requirements.txt.')
    return node


def owned_health(state):
    try:
        return all(request(state[key] + endpoint).get('run_id') == state['run_id']
                   for key, endpoint in [('backend_url', '/api/__dedato_local'),
                                         ('url', '/__dedato_local'), ('url', '/api/__dedato_local')])
    except (OSError, ValueError, RuntimeError, AttributeError):
        return False


def stop_child(child):
    if child.poll() is None:
        # Signal only our own Popen process group, never an arbitrary saved PID.
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            child.wait(timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait(timeout=5)
    if child.stdin:
        child.stdin.close()


def supervise(node):
    with lock('run.lock', False) as owner_lock:
        run_id = secrets.token_hex(16)
        token = secrets.token_hex(32)
        shutdown = threading.Event()
        state = {'root': str(ROOT), 'run_id': run_id, 'token': token,
                 'status': 'starting', 'pid': os.getpid()}
        children = []
        files = []

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def respond(self):
                if self.headers.get('Authorization') != 'Bearer ' + token:
                    self.send_error(403)
                    return
                if self.path == '/stop' and self.command == 'POST':
                    shutdown.set()
                elif self.path != '/status' or self.command != 'GET':
                    self.send_error(404)
                    return
                result = {k: v for k, v in state.items() if k != 'token'}
                if state['status'] == 'ready' and not owned_health(state):
                    result['status'] = 'unhealthy'
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps(result).encode())
            do_GET = respond
            do_POST = respond

        control = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        control.daemon_threads = True
        state['control_url'] = 'http://127.0.0.1:%s' % control.server_port
        write_json(STATE / 'state.json', state)
        threading.Thread(target=control.serve_forever, daemon=True).start()
        signal.signal(signal.SIGTERM, lambda *_: shutdown.set())
        signal.signal(signal.SIGINT, lambda *_: shutdown.set())
        backend_socket = socket.socket()
        try:
            backend_socket.bind(('127.0.0.1', 0))
            backend_socket.listen(128)
            state['backend_url'] = 'http://127.0.0.1:%s' % backend_socket.getsockname()[1]
            secret_file = STATE / 'jwt-secret'
            if not secret_file.exists():
                secret_file.write_text(secrets.token_hex(32))
                secret_file.chmod(0o600)
            env = clean_env()
            env.update(DEDATO_ROOT=str(ROOT), DEDATO_STATE=str(STATE), DEDATO_RUN_ID=run_id,
                       ENVIRONMENT='development', DEV_E2E='true', CALENDAR_ADMISSION_MODE='unified', DATABASE_URL='sqlite:///' + str(STATE / 'local.db'),
                       JWT_SECRET_KEY=secret_file.read_text().strip(),
                       ZVONOK_MODE='stub', ROBOKASSA_MODE='stub', EMAIL_ENABLED='false',
                       APPLE_IAP_ENABLED='false', PUSH_NOTIFICATIONS_ENABLED='false',
                       YANDEX_AUTH_ENABLED='false', REDIS_HOST='127.0.0.1', REDIS_PORT='9',
                       VITE_API_BASE_URL=state['backend_url'], API_BASE_URL=state['backend_url'])
            (STATE / 'empty-env').mkdir(exist_ok=True)
            (STATE / 'runtime').mkdir(exist_ok=True)
            frontend_log = (STATE / 'frontend.log').open('w')
            files.append(frontend_log)
            frontend = subprocess.Popen([node, str(SCRIPT_DIR / 'local_frontend.mjs')], env=env,
                                        cwd=ROOT / 'frontend', stdin=subprocess.PIPE, stdout=frontend_log,
                                        stderr=subprocess.STDOUT, start_new_session=True,
                                        pass_fds=(owner_lock.fileno(),))
            children.append(frontend)
            deadline = time.monotonic() + TIMEOUT
            while time.monotonic() < deadline and not shutdown.is_set():
                result = read_json(STATE / 'frontend.json')
                if result.get('run_id') == run_id:
                    state['url'] = result['url']
                    break
                if frontend.poll() is not None:
                    raise RuntimeError('Frontend не запустился. Подробности: frontend.log')
                time.sleep(.2)
            else:
                raise RuntimeError('Истекло время ожидания frontend.')
            env['FRONTEND_URL'] = state['url']
            backend_log = (STATE / 'backend.log').open('w')
            files.append(backend_log)
            backend = subprocess.Popen(
                [python_executable(), '-m', 'uvicorn', 'local_backend:app', '--app-dir', str(SCRIPT_DIR),
                 '--fd', str(backend_socket.fileno()), '--reload', '--reload-dir', str(ROOT / 'backend'),
                 '--timeout-graceful-shutdown', '3'],
                env=env, cwd=STATE / 'runtime', pass_fds=(backend_socket.fileno(), owner_lock.fileno()),
                stdin=subprocess.DEVNULL, stdout=backend_log, stderr=subprocess.STDOUT, start_new_session=True)
            children.append(backend)
            state['backend_pid'], state['frontend_pid'] = backend.pid, frontend.pid
            # Parent-death watchdog also handles SIGKILL of the supervisor.
            watchdog_env = clean_env()
            watchdog = subprocess.Popen([python_executable(), str(SCRIPT_DIR / 'local_watchdog.py'),
                                         str(os.getpid()), str(backend.pid)], env=watchdog_env,
                                        stdin=subprocess.PIPE, stdout=backend_log, stderr=subprocess.STDOUT)
            children.append(watchdog)
            while time.monotonic() < deadline and not shutdown.is_set():
                if any(c.poll() is not None for c in children):
                    raise RuntimeError('Локальный сервер завершился. Подробности: backend.log / frontend.log')
                if owned_health(state):
                    break
                time.sleep(.3)
            else:
                raise RuntimeError('Истекло время ожидания API; см. backend.log.')
            # Seed only this private database, once. Restarts preserve manual edits.
            if not (STATE / 'seed.json').exists():
                seed = request(state['backend_url'] + '/api/dev/e2e/seed', {'reset': False}, timeout=30)
                if not seed.get('success'):
                    raise RuntimeError('Не удалось подготовить локальные тестовые данные.')
                write_json(STATE / 'seed.json', seed)
            html = request(state['url'] + '/')
            if not isinstance(html, str) or '<html' not in html.lower():
                raise RuntimeError('Frontend не отдал страницу приложения.')
            state['status'] = 'ready'
            write_json(STATE / 'state.json', state)
            print('READY ' + state['url'], flush=True)
            while not shutdown.wait(.5):
                if any(c.poll() is not None for c in children):
                    raise RuntimeError('Один из серверов остановился; окружение будет закрыто.')
        except Exception as exc:
            state['status'], state['error'] = 'failed', str(exc)
            print(str(exc), file=sys.stderr, flush=True)
        finally:
            # Watchdog exits after its pipe is closed; it only signals the backend group.
            for child in children:
                if child is locals().get('watchdog'):
                    child.stdin.close()
                    child.wait(timeout=12)
                else:
                    stop_child(child)
            backend_socket.close()
            for handle in files:
                handle.close()
            if state['status'] != 'failed':
                state['status'] = 'stopped'
            write_json(STATE / 'state.json', state)
            control.shutdown()
            control.server_close()


def wait_stopped():
    deadline = time.monotonic() + 30
    while running():
        if time.monotonic() > deadline:
            raise RuntimeError('Остановка ещё не завершена; повторный сервер не запущен.')
        time.sleep(.2)


def start(open_browser):
    deadline = time.monotonic() + TIMEOUT + 35
    while running():
        try:
            current = controller()
        except (OSError, ValueError, RuntimeError):
            # A killed supervisor's children hold the ownership lock until their
            # watchdog/EOF cleanup finishes. Never start a second stack meanwhile.
            current = {'status': 'starting'}
        if current['status'] == 'ready':
            show(current, open_browser, reused=True)
            return
        if current['status'] == 'unhealthy':
            controller('stop')
            wait_stopped()
            break
        if time.monotonic() > deadline:
            raise RuntimeError('Предыдущий запуск не завершён; второй сервер не создан.')
        time.sleep(.3)
    node = preflight()
    with (STATE / 'launcher.log').open('w') as log:
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '_serve', '--node', node],
                                   stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True, env=clean_env())
    deadline = time.monotonic() + TIMEOUT + 35
    while time.monotonic() < deadline:
        if process.poll() is not None:
            failure = read_json(STATE / 'state.json')
            raise RuntimeError(failure.get('error', 'Не удалось запустить окружение.'))
        try:
            current = controller()
            if current['status'] == 'ready':
                show(current, open_browser)
                return
            if current['status'] == 'failed':
                raise RuntimeError(current.get('error', 'Ошибка запуска'))
        except (OSError, ValueError):
            pass
        except RuntimeError as exc:
            if 'ещё не готов' not in str(exc):
                raise
        time.sleep(.3)
    raise RuntimeError('Запуск ещё не завершён. Проверьте launcher.log.')


def log_paths(as_json=False):
    paths = {name: str((STATE / (name + '.log')).resolve())
             for name in ('backend', 'frontend', 'launcher')}
    if as_json:
        print(json.dumps(paths))
    else:
        for path in paths.values():
            print(path)


def show(state, open_browser=False, reused=False):
    print(('Уже запущен: ' if reused else 'Dedato готов: ') + state['url'])
    print('API: ' + state['backend_url'])
    print('Логи и локальная БД: ' + str(STATE))
    if open_browser:
        command = ['open', state['url']] if sys.platform == 'darwin' else ['xdg-open', state['url']]
        result = subprocess.run(command, capture_output=True)
        if result.returncode:
            print('Откройте ссылку выше в браузере.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', nargs='?', choices=['start', 'stop', 'status', 'logs', '_serve'], default='start')
    parser.add_argument('--no-open', action='store_true')
    parser.add_argument('--node', help=argparse.SUPPRESS)
    parser.add_argument('--json', action='store_true', help='Вывести пути к логам в JSON (только logs)')
    args = parser.parse_args()
    if args.json and args.action != 'logs':
        parser.error('--json доступна только для команды logs')
    if args.action == 'logs':
        log_paths(as_json=args.json)
        return
    os.umask(0o077)
    STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    if args.action == '_serve':
        supervise(args.node)
        return
    try:
        with lock('command.lock'):
            if args.action == 'start':
                start(not args.no_open)
            elif args.action == 'stop':
                if running():
                    controller('stop')
                    wait_stopped()
                print('Локальный Dedato остановлен. Данные сохранены.')
            elif running():
                current = controller()
                if current['status'] != 'ready':
                    raise RuntimeError('Состояние: ' + current['status'])
                show(current, reused=True)
            else:
                print('Локальный Dedato не запущен.')
    except (OSError, RuntimeError, ValueError) as exc:
        print('Ошибка: %s\nПодробности: %s' % (exc, STATE / 'launcher.log'), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
