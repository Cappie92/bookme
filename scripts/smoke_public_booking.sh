#!/usr/bin/env bash
# Smoke: public booking API. GET profile, GET availability, (optional) POST booking if TOKEN set.
# Usage: SLUG=m-TK5E3n9R [TOKEN=...] ./scripts/smoke_public_booking.sh
# Or:    ./scripts/smoke_public_booking.sh m-TK5E3n9R

set -e
SLUG="${1:-${SLUG:-m-TK5E3n9R}}"
API_BASE="${API_URL:-http://localhost:8000}"
FROM_DATE=$(date +%Y-%m-%d)
TO_DATE=$(date -v+14d +%Y-%m-%d 2>/dev/null || date -d "+14 days" +%Y-%m-%d 2>/dev/null)

echo "=== Public booking smoke: slug=$SLUG base=$API_BASE ==="

# 1) GET profile
PROFILE=$(curl -sS "${API_BASE}/api/public/masters/${SLUG}")
if echo "$PROFILE" | jq -e '.id' >/dev/null 2>&1; then
  echo "OK GET /api/public/masters/${SLUG}"
else
  echo "FAIL GET profile: $PROFILE"
  exit 1
fi

SERVICE_ID=$(echo "$PROFILE" | jq -r '.services[0].id // empty')
if [ -z "$SERVICE_ID" ]; then
  echo "WARN no services for master"
  exit 0
fi
echo "  first service_id=$SERVICE_ID"

# 2) GET availability
AVAIL=$(curl -sS "${API_BASE}/api/public/masters/${SLUG}/availability?service_id=${SERVICE_ID}&from_date=${FROM_DATE}&to_date=${TO_DATE}")
SLOT_COUNT=$(echo "$AVAIL" | jq -r '.slots | length')
FIRST_START=$(echo "$AVAIL" | jq -r '.slots[0].start_time // empty')
FIRST_END=$(echo "$AVAIL" | jq -r '.slots[0].end_time // empty')
echo "OK GET availability: slots count=$SLOT_COUNT"
if [ "$SLOT_COUNT" -gt 0 ]; then
  echo "  first slot: ${FIRST_START} - ${FIRST_END}"
  if [ -z "$FIRST_START" ] || [ -z "$FIRST_END" ]; then
    echo "WARN first slot missing start_time/end_time"
    exit 1
  fi
else
  echo "WARN no available dates in next 14 days"
fi

# 3) Optional: create booking if TOKEN set (используем реальный слот из availability)
if [ -n "${TOKEN}" ]; then
  START_TIME="${FIRST_START:-}"
  END_TIME="${FIRST_END:-}"
  if [ -n "$START_TIME" ] && [ -n "$END_TIME" ]; then
    CREATED=$(curl -sS -X POST "${API_BASE}/api/public/masters/${SLUG}/bookings" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer ${TOKEN}" \
      -d "{\"service_id\":${SERVICE_ID},\"start_time\":\"${START_TIME}\",\"end_time\":\"${END_TIME}\"}")
    BOOKING_ID=$(echo "$CREATED" | jq -r '.id // empty')
    if [ -n "$BOOKING_ID" ]; then
      echo "OK POST booking id=$BOOKING_ID"
      curl -sS "${API_BASE}/api/client/bookings/${BOOKING_ID}/calendar.ics?alarm_minutes=60" -o "/tmp/booking_${BOOKING_ID}.ics"
      echo "  ics saved to /tmp/booking_${BOOKING_ID}.ics"
      PAST=$(curl -sS -H "Authorization: Bearer ${TOKEN}" "${API_BASE}/api/client/bookings/past")
      if echo "$PAST" | jq -e --arg id "$BOOKING_ID" '[.[] | select(.id == ($id | tonumber))] | length > 0' >/dev/null 2>&1; then
        echo "  booking found in GET /api/client/bookings/past"
      fi
    else
      echo "FAIL POST booking: $CREATED"
      exit 1
    fi
  else
    echo "SKIP POST: no slots to book"
  fi
else
  echo "TOKEN not set — skip POST booking"
fi

echo "=== smoke done ==="
