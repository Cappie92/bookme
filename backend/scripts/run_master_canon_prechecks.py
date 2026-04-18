#!/usr/bin/env python3
"""
MASTER_CANON Stage 1 — Pre-checks (docs/MASTER_CANON_MIGRATION_PLAN.md 0.G).
Запуск: cd backend && python3 scripts/run_master_canon_prechecks.py
Вывод: JSON в stdout + создание docs/MASTER_CANON_PRECHECK_RESULTS.md
"""
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text
from database import engine


QUERIES = {
    "duplicates_user_id": """
        SELECT user_id, COUNT(*) AS cnt
        FROM indie_masters
        WHERE user_id IS NOT NULL
        GROUP BY user_id
        HAVING COUNT(*) > 1
    """,
    "violations_1to1": """
        SELECT m.id AS master_id, COUNT(im.id) AS indie_count
        FROM masters m
        JOIN indie_masters im ON im.user_id = m.user_id
        GROUP BY m.id
        HAVING COUNT(im.id) > 1
    """,
    "total_indie_masters": "SELECT COUNT(*) AS total FROM indie_masters",
    "no_user_id": "SELECT COUNT(*) AS cnt FROM indie_masters WHERE user_id IS NULL",
    "orphan_user": """
        SELECT COUNT(*) AS cnt
        FROM indie_masters im
        WHERE im.user_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = im.user_id)
    """,
    "no_master": """
        SELECT COUNT(*) AS cnt
        FROM indie_masters im
        WHERE im.user_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = im.user_id)
          AND NOT EXISTS (SELECT 1 FROM masters m WHERE m.user_id = im.user_id)
    """,
    "indie_fav_count": """
        SELECT COUNT(*) AS cnt FROM client_favorites WHERE favorite_type = 'indie_master'
    """,
    "would_be_duplicates": """
        SELECT COUNT(*) AS cnt
        FROM client_favorites cf
        JOIN indie_masters im ON im.id = cf.indie_master_id
        JOIN masters m ON m.user_id = im.user_id
        WHERE cf.favorite_type = 'indie_master'
          AND EXISTS (
            SELECT 1 FROM client_favorites ex
            WHERE ex.client_id = cf.client_id
              AND ex.favorite_type = 'master'
              AND ex.master_id = m.id
          )
    """,
}


def run_query(conn, name: str, query: str):
    """Execute query and return rows as list of dicts."""
    result = conn.execute(text(query))
    columns = result.keys()
    return [dict(zip(columns, row)) for row in result.fetchall()]


def main():
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
    results = {"timestamp": ts, "queries": {}, "summary": {}}

    with engine.connect() as conn:
        for name, query in QUERIES.items():
            rows = run_query(conn, name, query)
            results["queries"][name] = {"sql": query.strip(), "rows": rows}

    # Summary
    dup = results["queries"]["duplicates_user_id"]["rows"]
    viol = results["queries"]["violations_1to1"]["rows"]
    no_uid = results["queries"]["no_user_id"]["rows"][0]["cnt"] if results["queries"]["no_user_id"]["rows"] else 0
    orphan = results["queries"]["orphan_user"]["rows"][0]["cnt"] if results["queries"]["orphan_user"]["rows"] else 0
    no_mast = results["queries"]["no_master"]["rows"][0]["cnt"] if results["queries"]["no_master"]["rows"] else 0

    results["summary"] = {
        "duplicates_user_id_count": len(dup),
        "violations_1to1_count": len(viol),
        "indie_masters_no_user_id": no_uid,
        "indie_masters_orphan_user": orphan,
        "indie_masters_no_master": no_mast,
        "indie_fav_count": results["queries"]["indie_fav_count"]["rows"][0]["cnt"] if results["queries"]["indie_fav_count"]["rows"] else 0,
        "would_be_duplicates": results["queries"]["would_be_duplicates"]["rows"][0]["cnt"] if results["queries"]["would_be_duplicates"]["rows"] else 0,
    }

    # Decision
    can_proceed = (
        len(dup) == 0
        and len(viol) == 0
        and orphan == 0
    )
    results["can_proceed"] = can_proceed
    results["reason"] = (
        "OK: no duplicates, no violations, no orphan users"
        if can_proceed
        else (
            f"BLOCKED: duplicates_user_id={len(dup)}, violations_1to1={len(viol)}, orphan_user={orphan}. "
            "See docs/MASTER_CANON_MIGRATION_PLAN.md 0.H for remediation."
        )
    )

    # Write report
    repo_root = Path(__file__).resolve().parent.parent.parent
    report_path = repo_root / "docs" / "MASTER_CANON_PRECHECK_RESULTS.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    md = f"""# MASTER_CANON Pre-check Results

**Дата/время:** {ts}

## Запросы и результаты

| Проверка | Результат |
|----------|-----------|
| Дубли indie_masters.user_id | {len(dup)} строк |
| Нарушения 1:1 (masters с >1 indie) | {len(viol)} строк |
| indie_masters без user_id | {no_uid} |
| indie_masters с user_id, но без users | {orphan} |
| indie_masters без Master (кандидаты на создание) | {no_mast} |
| client_favorites indie_master | {results['summary']['indie_fav_count']} |
| would_be_duplicates (после маппинга) | {results['summary']['would_be_duplicates']} |

## Вывод

**Продолжать к Этапу 1:** {"ДА" if can_proceed else "НЕТ"}

**Причина:** {results["reason"]}

## SQL (для воспроизведения)

```sql
-- 0.G.1 Дубли user_id
{QUERIES['duplicates_user_id'].strip()}

-- 0.G.2 Нарушения 1:1
{QUERIES['violations_1to1'].strip()}

-- 0.G.3 Статистика
{QUERIES['total_indie_masters'].strip()}
{QUERIES['no_user_id'].strip()}
{QUERIES['orphan_user'].strip()}
{QUERIES['no_master'].strip()}

-- 0.G.4 Favorites
{QUERIES['indie_fav_count'].strip()}
{QUERIES['would_be_duplicates'].strip()}
```
"""
    report_path.write_text(md, encoding="utf-8")
    print(json.dumps(results, indent=2, default=str))
    return 0 if can_proceed else 1


if __name__ == "__main__":
    sys.exit(main())
