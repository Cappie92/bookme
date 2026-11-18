"""ASGI entrypoint for the isolated one-click LOCAL environment only."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(os.environ['DEDATO_ROOT']) / 'backend'))
from settings import Settings

# Never load the repository's .env (which may describe a different environment).
Settings.model_config['env_file'] = None
from main import app
from fastapi.responses import JSONResponse


@app.middleware('http')
async def local_identity(request, call_next):
    if request.url.path == '/api/__dedato_local':
        return JSONResponse({'run_id': os.environ['DEDATO_RUN_ID']})
    return await call_next(request)
