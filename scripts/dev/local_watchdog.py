"""Terminate only the owned backend group when the supervisor's pipe closes."""
import os
import signal
import sys
import time

parent, backend = map(int, sys.argv[1:])
sys.stdin.buffer.read()
try:
    os.killpg(backend, signal.SIGTERM)
except ProcessLookupError:
    sys.exit(0)
# The backend's reloader should stop its worker in response to TERM.
# Avoid killing a reused group: wait only while the original process exists.
for _ in range(40):
    try:
        os.kill(backend, 0)
    except ProcessLookupError:
        sys.exit(0)
    time.sleep(.2)
try:
    os.killpg(backend, signal.SIGKILL)
except ProcessLookupError:
    pass
