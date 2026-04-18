# Diff-summary: Web «Клиенты» + дашборд + «Все записи»

## Изменённые файлы

### Backend
| Файл | Изменения |
|------|-----------|
| `backend/routers/master_clients.py` | Возврат к `_get_clients_with_completed`: список/поиск только клиенты с ≥1 completed. Detail/PATCH по-прежнему доступны по metadata или любому booking. |

### Frontend
| Файл | Изменения |
|------|-----------|
| `MasterClients.jsx` | Иконка: InformationCircle (серый), без link-стилей; popover вместо модалки; убран dev-лог |
| `MasterDashboardStats.jsx` | Компактный layout: `display_name (phone)`; убраны dev-логи; уменьшены отступы и кнопки |
| `AllBookingsModal.jsx` | Фильтры всегда видны; компактный список; `clientLabel = display_name (phone)`; пагинация [Назад] Стр. X из Y [Вперёд] вместо «Показать ещё» |

### Тесты
| Файл | Изменения |
|------|-----------|
| `test_master_clients_any_booking.py` | Удалён |
| `test_master_clients_completed_only.py` | Добавлен: проверка, что в списке только completed-клиенты |

### Docs
| Файл | Изменения |
|------|-----------|
| `CLIENTS_MODULE_MANUAL_TEST.md` | Обновлён чеклист: completed-only, popover, пагинация |

---

## Ручная проверка

```bash
cd backend && uvicorn main:app --reload --port 8000
cd frontend && npm run dev
```

1. Клиенты: в списке только completed; иконка (i) серая, popover по клику
2. Дашборд: `display_name (phone)` компактно
3. Все записи: фильтры видны, пагинация, компактные строки
