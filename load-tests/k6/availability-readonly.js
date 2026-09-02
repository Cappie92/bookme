/**
 * DeDato k6 — isolated read-only availability smoke/baseline.
 *
 * Allowed HTTP only:
 *   GET /api/health
 *   GET /api/public/masters/{slug}          (setup once)
 *   GET /api/public/masters/{slug}/availability  (VU)
 *
 * No login, price-preview, bookings, or write methods.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const UA = 'DeDato-LoadTest/read-only-availability';
const CANONICAL_BASE_URL = 'https://test.dedato.ru';

const availabilityDuration = new Trend('availability_duration', true);
const availabilityErrors = new Rate('availability_errors');
const availability5xx = new Counter('availability_5xx');

function envTrim(name) {
  const raw = __ENV[name];
  if (raw === undefined || raw === null) {
    return '';
  }
  return String(raw).trim();
}

function requireEnvExact(name, expected) {
  const value = envTrim(name);
  if (value !== expected) {
    throw new Error(
      `${name} must be exactly "${expected}" before this script may run (got ${JSON.stringify(value || '(empty)')})`,
    );
  }
  return value;
}

function requireNonEmpty(name) {
  const value = envTrim(name);
  if (!value) {
    throw new Error(`${name} is required and must not be empty`);
  }
  return value;
}

/**
 * Strict staging gate: after trim, only exact
 *   https://test.dedato.ru
 *   https://test.dedato.ru/
 * are accepted. No URL parser — k6 init has no global URL.
 */
function assertStagingBaseUrl(raw) {
  const trimmed = String(raw == null ? '' : raw).trim();
  if (trimmed !== CANONICAL_BASE_URL && trimmed !== `${CANONICAL_BASE_URL}/`) {
    throw new Error(
      `BASE_URL must be exactly "${CANONICAL_BASE_URL}" or "${CANONICAL_BASE_URL}/" (got ${JSON.stringify(trimmed || '(empty)')})`,
    );
  }
  return CANONICAL_BASE_URL;
}

function parseStrictYmd(value, label) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    throw new Error(`${label} must be YYYY-MM-DD (got ${JSON.stringify(value)})`);
  }
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== mo - 1 ||
    dt.getUTCDate() !== d
  ) {
    throw new Error(`${label} is not a real calendar date: ${value}`);
  }
  return dt;
}

function formatYmdUtc(dt) {
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDaysUtc(dt, days) {
  const out = new Date(dt.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function utcTodayDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function resolveDateWindow() {
  if (envTrim('TO_DATE')) {
    throw new Error('TO_DATE is not allowed; to_date is always from_date + 14 days');
  }

  const fromRaw = envTrim('FROM_DATE');
  const fromDt = fromRaw ? parseStrictYmd(fromRaw, 'FROM_DATE') : utcTodayDate();
  const toDt = addDaysUtc(fromDt, 14);
  return {
    fromDate: formatYmdUtc(fromDt),
    toDate: formatYmdUtc(toDt),
  };
}

function parseOptionalServiceId() {
  const raw = envTrim('SERVICE_ID');
  if (!raw) {
    return null;
  }
  if (!/^[1-9]\d*$/.test(raw)) {
    throw new Error(`SERVICE_ID must be a positive integer (got ${JSON.stringify(raw)})`);
  }
  return Number(raw);
}

function commonHeaders() {
  return {
    'User-Agent': UA,
    Accept: 'application/json',
  };
}

function buildOptions() {
  requireEnvExact('CONFIRM_STAGING', 'YES');
  assertStagingBaseUrl(requireNonEmpty('BASE_URL'));
  requireNonEmpty('MASTER_SLUG');

  if (envTrim('TO_DATE')) {
    throw new Error('TO_DATE is not allowed; to_date is always from_date + 14 days');
  }
  const fromRaw = envTrim('FROM_DATE');
  if (fromRaw) {
    parseStrictYmd(fromRaw, 'FROM_DATE');
  }
  parseOptionalServiceId();

  const profile = envTrim('PROFILE') || 'smoke';
  if (profile !== 'smoke' && profile !== 'baseline' && profile !== 'staircase') {
    throw new Error(
      `PROFILE must be "smoke", "baseline" or "staircase" (got ${JSON.stringify(profile)})`,
    );
  }

  if (profile === 'baseline') {
    requireEnvExact('CONFIRM_BASELINE', 'YES');
  }

  if (profile === 'staircase') {
    requireEnvExact('CONFIRM_STAIRCASE', 'YES');
  }

  const observeRaw = envTrim('CONFIRM_STAIRCASE_OBSERVE');
  if (observeRaw) {
    if (observeRaw !== 'YES') {
      throw new Error(
        `CONFIRM_STAIRCASE_OBSERVE must be exactly "YES" when set (got ${JSON.stringify(observeRaw)})`,
      );
    }
    if (profile !== 'staircase') {
      throw new Error(
        `CONFIRM_STAIRCASE_OBSERVE=YES is only allowed with PROFILE=staircase (got ${JSON.stringify(profile)})`,
      );
    }
  }
  const staircaseObserve = observeRaw === 'YES';

  // Untagged SLO for smoke/baseline. 5xx aborts immediately; latency/error-rate wait 30s.
  const smokeBaselineThresholds = {
    availability_duration: [
      { threshold: 'p(95)<1000', abortOnFail: true, delayAbortEval: '30s' },
      { threshold: 'p(99)<2000', abortOnFail: true, delayAbortEval: '30s' },
    ],
    availability_errors: [
      { threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' },
    ],
    availability_5xx: [{ threshold: 'count==0', abortOnFail: true }],
  };

  if (profile === 'smoke') {
    return {
      scenarios: {
        availability_smoke: {
          executor: 'shared-iterations',
          vus: 1,
          iterations: 1,
          maxDuration: '1m',
        },
      },
      thresholds: smokeBaselineThresholds,
    };
  }

  if (profile === 'baseline') {
    return {
      scenarios: {
        availability_baseline: {
          executor: 'constant-vus',
          vus: 10,
          duration: '5m',
          gracefulStop: '15s',
        },
      },
      thresholds: smokeBaselineThresholds,
    };
  }

  // delayAbortEval is from test start, not scenario start.
  // Step 10: 0s+30s → 30s; step 20: 2m15s+30s → 2m45s;
  // step 30: 4m30s+30s → 5m; step 40: 6m45s+30s → 7m15s.
  const durationAbortOnFail = !staircaseObserve;
  const stepThresholds = (stepName, delayAbortEval) => ({
    [`availability_duration{load_step:${stepName}}`]: [
      { threshold: 'p(95)<1000', abortOnFail: durationAbortOnFail, delayAbortEval },
      { threshold: 'p(99)<2000', abortOnFail: durationAbortOnFail, delayAbortEval },
    ],
    [`availability_errors{load_step:${stepName}}`]: [
      { threshold: 'rate<0.01', abortOnFail: true, delayAbortEval },
    ],
    [`availability_5xx{load_step:${stepName}}`]: [
      { threshold: 'count==0', abortOnFail: true },
    ],
  });

  return {
    scenarios: {
      availability_step_10: {
        executor: 'constant-vus',
        exec: 'availability_step_10',
        startTime: '0s',
        vus: 10,
        duration: '2m',
        gracefulStop: '10s',
      },
      availability_step_20: {
        executor: 'constant-vus',
        exec: 'availability_step_20',
        startTime: '2m15s',
        vus: 20,
        duration: '2m',
        gracefulStop: '10s',
      },
      availability_step_30: {
        executor: 'constant-vus',
        exec: 'availability_step_30',
        startTime: '4m30s',
        vus: 30,
        duration: '2m',
        gracefulStop: '10s',
      },
      availability_step_40: {
        executor: 'constant-vus',
        exec: 'availability_step_40',
        startTime: '6m45s',
        vus: 40,
        duration: '2m',
        gracefulStop: '10s',
      },
    },
    thresholds: {
      ...stepThresholds('availability_step_10', '30s'),
      ...stepThresholds('availability_step_20', '2m45s'),
      ...stepThresholds('availability_step_30', '5m'),
      ...stepThresholds('availability_step_40', '7m15s'),
      // Untagged safety: any 5xx aborts the whole run immediately.
      availability_5xx: [{ threshold: 'count==0', abortOnFail: true }],
    },
  };
}

export const options = buildOptions();

const PROFILE = envTrim('PROFILE') || 'smoke';
const BASE_URL = assertStagingBaseUrl(requireNonEmpty('BASE_URL'));
const MASTER_SLUG = requireNonEmpty('MASTER_SLUG');
const OPTIONAL_SERVICE_ID = parseOptionalServiceId();
const DATE_WINDOW = resolveDateWindow();

export function setup() {
  const healthRes = http.get(`${BASE_URL}/api/health`, {
    headers: commonHeaders(),
    tags: { name: 'backend_health' },
  });

  if (healthRes.status !== 200) {
    throw new Error(`setup: GET /api/health failed with status ${healthRes.status}`);
  }

  const profileRes = http.get(
    `${BASE_URL}/api/public/masters/${encodeURIComponent(MASTER_SLUG)}`,
    {
      headers: commonHeaders(),
      tags: { name: 'public_master_profile' },
    },
  );

  if (profileRes.status !== 200) {
    throw new Error(
      `setup: GET /api/public/masters/{slug} failed with status ${profileRes.status}`,
    );
  }

  let profileBody;
  try {
    profileBody = profileRes.json();
  } catch (e) {
    throw new Error(`setup: master profile response is not valid JSON: ${String(e)}`);
  }

  if (!profileBody || typeof profileBody !== 'object') {
    throw new Error('setup: master profile JSON must be an object');
  }

  const services = profileBody.services;
  if (!Array.isArray(services) || services.length === 0) {
    throw new Error('setup: master profile has no services[] to pick a service_id from');
  }

  let serviceId = null;
  if (OPTIONAL_SERVICE_ID !== null) {
    const match = services.find(
      (s) => s && typeof s === 'object' && Number(s.id) === OPTIONAL_SERVICE_ID,
    );
    if (!match) {
      throw new Error(
        `setup: SERVICE_ID=${OPTIONAL_SERVICE_ID} not found in master services[]`,
      );
    }
    serviceId = OPTIONAL_SERVICE_ID;
  } else {
    const first = services.find(
      (s) =>
        s &&
        typeof s === 'object' &&
        s.id !== undefined &&
        s.id !== null &&
        Number.isFinite(Number(s.id)) &&
        Number(s.id) > 0,
    );
    if (!first) {
      throw new Error('setup: no service with a valid positive id in services[]');
    }
    serviceId = Number(first.id);
  }

  // Non-secret data only for VUs.
  return {
    baseUrl: BASE_URL,
    slug: MASTER_SLUG,
    serviceId: serviceId,
    fromDate: DATE_WINDOW.fromDate,
    toDate: DATE_WINDOW.toDate,
  };
}

function runAvailabilityIteration(data, loadStep) {
  const url =
    `${data.baseUrl}/api/public/masters/${encodeURIComponent(data.slug)}/availability` +
    `?service_id=${encodeURIComponent(String(data.serviceId))}` +
    `&from_date=${encodeURIComponent(data.fromDate)}` +
    `&to_date=${encodeURIComponent(data.toDate)}`;

  const requestTags = { name: 'availability' };
  if (loadStep) {
    requestTags.load_step = loadStep;
  }

  const res = http.get(url, {
    headers: commonHeaders(),
    tags: requestTags,
  });

  const is5xx = res.status >= 500 && res.status <= 599;
  const metricTags = loadStep ? { load_step: loadStep } : undefined;

  // setup() requests must not feed this trend — only VU availability calls do.
  if (metricTags) {
    availabilityDuration.add(res.timings.duration, metricTags);
  } else {
    availabilityDuration.add(res.timings.duration);
  }

  if (loadStep) {
    // Always sample tagged Counter (including 0) so each step submetric exists.
    availability5xx.add(is5xx ? 1 : 0, metricTags);
  } else if (is5xx) {
    availability5xx.add(1);
  }

  let body = null;
  let jsonOk = false;
  try {
    body = res.json();
    jsonOk = body !== null && typeof body === 'object';
  } catch (e) {
    body = null;
    jsonOk = false;
  }

  const ok = check(res, {
    'availability status is 200': (r) => r.status === 200,
    'availability body is JSON object': () => jsonOk,
    'availability slots is an array': () => jsonOk && Array.isArray(body.slots),
    'availability is not 5xx': (r) => r.status < 500 || r.status > 599,
  });

  if (metricTags) {
    availabilityErrors.add(ok ? 0 : 1, metricTags);
  } else {
    availabilityErrors.add(ok ? 0 : 1);
  }

  if (PROFILE === 'baseline' || PROFILE === 'staircase') {
    // Client-like think time for availability step: 4–12 seconds.
    sleep(4 + Math.random() * 8);
  }
}

export default function (data) {
  runAvailabilityIteration(data, null);
}

export function availability_step_10(data) {
  runAvailabilityIteration(data, 'availability_step_10');
}

export function availability_step_20(data) {
  runAvailabilityIteration(data, 'availability_step_20');
}

export function availability_step_30(data) {
  runAvailabilityIteration(data, 'availability_step_30');
}

export function availability_step_40(data) {
  runAvailabilityIteration(data, 'availability_step_40');
}
