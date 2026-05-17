#!/usr/bin/env python3
"""
Prod/stage smoke seed — обёртка над seed_loyalty_smoke.py.

Не вызывает reseed_local_test_data / reset_non_admin_users.

Пример:
  python3 backend/scripts/prod_smoke_seed.py \\
    --prod-smoke --enable-smoke-seed --i-understand-this-writes-smoke-data

Docker:
  docker-compose -f docker-compose.prod.yml exec -T backend sh -lc \\
    'cd /app && python3 scripts/prod_smoke_seed.py --prod-smoke --enable-smoke-seed --i-understand-this-writes-smoke-data'
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.seed_loyalty_smoke import main

if __name__ == "__main__":
    raise SystemExit(main())
