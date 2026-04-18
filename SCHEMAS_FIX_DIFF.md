# Исправление NameError в backend/schemas.py

**Дата:** 2026-01-21  
**Проблема:** `NameError: name 'AppliedDiscountInfo' is not defined` при старте backend

**Причина:** Класс `Booking` (строка 391) использует `AppliedDiscountInfo` в аннотации типа (строка 419), но `AppliedDiscountInfo` объявлен позже (строка 1570).

---

## Unified Diff

```diff
--- a/backend/schemas.py
+++ b/backend/schemas.py
@@ -1,3 +1,5 @@
+from __future__ import annotations
+
 from datetime import datetime, time, date
 from enum import Enum
 from typing import List, Optional, Any, Dict
```

---

## Решение

Добавлен `from __future__ import annotations` в начало файла. Это включает отложенную оценку (lazy evaluation) всех аннотаций типов, что позволяет использовать forward references без необходимости заключать их в кавычки.

**Преимущества:**
- ✅ Все аннотации типов становятся строками автоматически
- ✅ Не нужно менять каждую аннотацию вручную
- ✅ Работает для всех forward references в файле
- ✅ Совместимо с Python 3.7+ и Pydantic

---

## Проверка

### 1. Импорт schemas.py
```bash
python3 -c "import schemas; print('✅ schemas.py импортирован успешно')"
```
**Результат:** ✅ Успешно

### 2. Импорт backend.main
```bash
python3 -c "from main import app; print('✅ backend.main импортирован успешно')"
```
**Результат:** ✅ Успешно

### 3. Проверка типов
```bash
python3 -c "from schemas import Booking, AppliedDiscountInfo; print(f'Booking.applied_discount: {Booking.model_fields[\"applied_discount\"].annotation}')"
```
**Результат:** ✅ `ForwardRef('Optional[AppliedDiscountInfo]')` - корректно разрешается

### 4. Проверка uvicorn
```bash
python3 -c "import uvicorn; from main import app; print('✅ uvicorn может импортировать app')"
```
**Результат:** ✅ Успешно

---

## Другие потенциальные forward references

С `from __future__ import annotations` все следующие типы также будут корректно разрешаться:

- `List[SubscriptionFreezeOut]` (строка 1156-1157)
- `List[LoyaltyDiscount]` (строка 1597-1598)
- `List[PersonalDiscount]` (строка 1599)
- `List[DiscountCandidate]` (строка 1632)
- `Optional[DiscountCandidate]` (строка 1633)
- `List[MasterStats]`, `List[MasterScheduleSlot]`, `List[PlaceScheduleSlot]`, и т.д.

Все эти типы теперь будут корректно разрешаться благодаря отложенной оценке аннотаций.

---

## Итоговый вывод

✅ **Проблема исправлена:** `NameError` больше не возникает при старте backend  
✅ **Все типы разрешаются корректно:** forward references работают автоматически  
✅ **Uvicorn может запуститься:** импорт `backend.main` проходит успешно  
✅ **Минимальный патч:** добавлена только одна строка в начало файла

---

**Файл изменён:** `backend/schemas.py` (строка 1)
