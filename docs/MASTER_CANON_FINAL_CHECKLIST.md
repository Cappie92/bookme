# MASTER_CANON Final Checklist

## Done when

- [ ] `MASTER_CANON_MODE=1` в production
- [ ] Reseed в master-only проходит без ошибок
- [ ] `verify_master_canon.py` exit 0
- [ ] GET /api/client/bookings/ и /past не возвращают `indie_master_id`
- [ ] GET /api/client/favorites/indie-masters → 410
- [ ] Mobile использует только master favorites

## Команды

### 1. Reseed

```bash
python3 backend/scripts/reseed_local_test_data.py --base-url http://localhost:8000
```

### 2. Verify (DB only)

```bash
python3 backend/scripts/verify_master_canon.py
```

### 3. Verify (DB + API)

```bash
# Сначала логин клиента
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"+79990000101","password":"test123"}' | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

# Verify
TOKEN=$TOKEN python3 backend/scripts/verify_master_canon.py
```

### 4. Проверка API контракта (indie_master_id отсутствует)

```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/client/bookings/past" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for b in d[:1]:
    assert 'indie_master_id' not in b, 'indie_master_id must be absent'
print('OK: indie_master_id absent')
"
```
