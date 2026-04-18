# MASTER_CANON Pre-check Results

**Дата/время:** 2026-02-16 07:50:25 UTC

## Запросы и результаты

| Проверка | Результат |
|----------|-----------|
| Дубли indie_masters.user_id | 0 строк |
| Нарушения 1:1 (masters с >1 indie) | 0 строк |
| indie_masters без user_id | 0 |
| indie_masters с user_id, но без users | 0 |
| indie_masters без Master (кандидаты на создание) | 0 |
| client_favorites indie_master | 1 |
| would_be_duplicates (после маппинга) | 1 |

## Вывод

**Продолжать к Этапу 1:** ДА

**Причина:** OK: no duplicates, no violations, no orphan users

## SQL (для воспроизведения)

```sql
-- 0.G.1 Дубли user_id
SELECT user_id, COUNT(*) AS cnt
        FROM indie_masters
        WHERE user_id IS NOT NULL
        GROUP BY user_id
        HAVING COUNT(*) > 1

-- 0.G.2 Нарушения 1:1
SELECT m.id AS master_id, COUNT(im.id) AS indie_count
        FROM masters m
        JOIN indie_masters im ON im.user_id = m.user_id
        GROUP BY m.id
        HAVING COUNT(im.id) > 1

-- 0.G.3 Статистика
SELECT COUNT(*) AS total FROM indie_masters
SELECT COUNT(*) AS cnt FROM indie_masters WHERE user_id IS NULL
SELECT COUNT(*) AS cnt
        FROM indie_masters im
        WHERE im.user_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = im.user_id)
SELECT COUNT(*) AS cnt
        FROM indie_masters im
        WHERE im.user_id IS NOT NULL
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = im.user_id)
          AND NOT EXISTS (SELECT 1 FROM masters m WHERE m.user_id = im.user_id)

-- 0.G.4 Favorites
SELECT COUNT(*) AS cnt FROM client_favorites WHERE favorite_type = 'indie_master'
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
```
