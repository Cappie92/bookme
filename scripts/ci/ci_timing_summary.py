#!/usr/bin/env python3
"""Write a CI timing summary from real step timestamps of the current run.

Reads job and step timings from the GitHub Actions REST API and appends a
Markdown report to $GITHUB_STEP_SUMMARY. Missing data is reported, never
raised: this script must not change the outcome of the test workflow.
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

SHARD_JOBS = ("backend shard 1", "backend shard 2")
SHARD_STEP = "Run pytest shard"
PLAYWRIGHT_JOB = "playwright"
PLAYWRIGHT_INSTALL_STEP = "Install Playwright Chromium"
PLAYWRIGHT_TEST_STEP = "Run Playwright E2E"
SELECT_JOB = "select"
# Jobs whose completion gates the result. Gate and report jobs are excluded.
SUITE_JOBS = (
    SELECT_JOB, *SHARD_JOBS, "backend collection", "backend",
    "frontend", "mobile", PLAYWRIGHT_JOB,
)
SKEW_WARN_RATIO = 0.25
SKEW_WARN_SEC = 60


def parse_time(value):
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def seconds(start, end):
    start, end = parse_time(start), parse_time(end)
    if start is None or end is None or end < start:
        return None
    return (end - start).total_seconds()


def fmt(value):
    if value is None:
        return "n/a"
    value = int(round(value))
    return f"{value // 60}m {value % 60:02d}s" if value >= 60 else f"{value}s"


def find_job(jobs, name):
    matches = [job for job in jobs if job.get("name") == name]
    return matches[-1] if matches else None


def find_step(job, name):
    if not job:
        return None
    for step in job.get("steps") or []:
        if step.get("name") == name:
            return step
    return None


def step_seconds(job, name):
    step = find_step(job, name)
    if not step or step.get("conclusion") == "skipped":
        return None
    return seconds(step.get("started_at"), step.get("completed_at"))


def setup_seconds(job, first_step):
    """Job start until the first measured step starts: checkout and installs."""
    step = find_step(job, first_step)
    if not job or not step:
        return None
    return seconds(job.get("started_at"), step.get("started_at"))


def shard_warnings(shard_times, missing_modules):
    warnings = []
    if missing_modules:
        warnings.append(
            "Backend duration profile is stale: modules without measured duration "
            "(median estimate used): " + ", ".join(f"`{m}`" for m in missing_modules)
            + ". Refresh `scripts/ci/backend_module_durations.json` with "
            "`backend_shards.py --emit-durations` from the shard JUnit reports."
        )
    known = [value for value in shard_times if value is not None]
    if len(known) == 2:
        skew = abs(known[0] - known[1])
        if skew >= SKEW_WARN_SEC and skew >= SKEW_WARN_RATIO * max(known):
            warnings.append(
                f"Backend shard skew {fmt(skew)}. Runner speed alone can cause this; "
                "refresh the duration profile if the skew repeats across runs."
            )
    return warnings


def build_summary(jobs, run_started_at, missing_modules):
    shards = [find_job(jobs, name) for name in SHARD_JOBS]
    shard_times = [step_seconds(job, SHARD_STEP) for job in shards]
    playwright = find_job(jobs, PLAYWRIGHT_JOB)
    select = find_job(jobs, SELECT_JOB)

    rows = [
        ("select job", seconds(select and select.get("started_at"),
                               select and select.get("completed_at"))),
    ]
    for name, job, value in zip(SHARD_JOBS, shards, shard_times):
        rows.append((f"{name}: setup (checkout, Python, pip)", setup_seconds(job, SHARD_STEP)))
        rows.append((f"{name}: pytest step", value))
    rows.append(("playwright: setup (checkout, Python, Node, npm ci)",
                 setup_seconds(playwright, PLAYWRIGHT_INSTALL_STEP)))
    rows.append(("playwright: install Chromium", step_seconds(playwright, PLAYWRIGHT_INSTALL_STEP)))
    rows.append(("playwright: E2E step", step_seconds(playwright, PLAYWRIGHT_TEST_STEP)))

    finishes = []
    for name in SUITE_JOBS:
        job = find_job(jobs, name)
        if not job or job.get("conclusion") == "skipped":
            continue
        offset = seconds(run_started_at, job.get("completed_at"))
        if offset is not None:
            finishes.append((offset, name, seconds(job.get("started_at"), job.get("completed_at"))))
    finishes.sort(reverse=True)

    lines = ["## CI timing", ""]
    lines += ["Step durations come from step timestamps, not whole-job time.", ""]
    lines += ["| Measurement | Duration |", "|---|---|"]
    lines += [f"| {label} | {fmt(value)} |" for label, value in rows]
    lines.append("")
    if finishes:
        offset, name, _ = finishes[0]
        lines.append(f"**Critical path:** `{name}` finished last, {fmt(offset)} after run start.")
        lines += ["", "| Job | Job duration | Finished after run start |", "|---|---|---|"]
        lines += [f"| {n} | {fmt(d)} | {fmt(o)} |" for o, n, d in finishes]
    else:
        lines.append("**Critical path:** n/a (no completed suite jobs).")
    warnings = shard_warnings(shard_times, missing_modules)
    if warnings:
        lines.append("")
        lines += [f"> [!WARNING]\n> {text}" for text in warnings]
    return "\n".join(lines) + "\n"


def profile_missing_modules():
    from backend_shards import DEFAULT_DURATIONS, discover_modules, load_durations
    backend = Path(__file__).resolve().parents[2] / "backend"
    durations = load_durations(DEFAULT_DURATIONS)
    return [name for name in discover_modules(backend) if name not in durations]


def api(path):
    url = f"{os.environ.get('GITHUB_API_URL', 'https://api.github.com')}{path}"
    request = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {os.environ['GITHUB_TOKEN']}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    })
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def fetch_jobs(repo, run_id, attempt):
    jobs, page = [], 1
    while True:
        data = api(f"/repos/{repo}/actions/runs/{run_id}/attempts/{attempt}/jobs?per_page=100&page={page}")
        batch = data.get("jobs") or []
        jobs += batch
        if len(batch) < 100:
            return jobs
        page += 1


def write(text):
    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if target:
        with open(target, "a", encoding="utf-8") as handle:
            handle.write(text)
    else:
        sys.stdout.write(text)


def main():
    try:
        missing = profile_missing_modules()
    except (OSError, ValueError, SystemExit) as exc:
        missing = []
        print(f"duration profile check skipped: {exc}", file=sys.stderr)
    try:
        repo = os.environ["GITHUB_REPOSITORY"]
        run_id = os.environ["GITHUB_RUN_ID"]
        attempt = os.environ.get("GITHUB_RUN_ATTEMPT", "1")
        run = api(f"/repos/{repo}/actions/runs/{run_id}")
        jobs = fetch_jobs(repo, run_id, attempt)
        text = build_summary(jobs, run.get("run_started_at"), missing)
    except (KeyError, OSError, ValueError, urllib.error.URLError) as exc:
        text = f"## CI timing\n\nTiming data unavailable ({exc.__class__.__name__}).\n"
        if missing:
            text += "\n" + "\n".join(f"> [!WARNING]\n> {w}" for w in shard_warnings([], missing)) + "\n"
    write(text)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:  # the report must never fail the workflow
        print(f"timing summary failed: {exc.__class__.__name__}", file=sys.stderr)
        raise SystemExit(0)
