# Проверка резервной копии базы данных

## Команды для проверки на сервере

### 1. Проверка наличия файла резервной копии

```bash
# Перейдите в директорию с базой данных
cd /home/root/dedato

# Проверьте, какие файлы резервных копий есть
ls -lh bookme.db.backup_*

# Или посмотрите все файлы с расширением .backup
ls -lh *.backup*
```

### 2. Проверка размера файлов

```bash
# Размер оригинальной базы данных
ls -lh bookme.db

# Размер резервной копии (должен быть примерно таким же)
ls -lh bookme.db.backup_*
```

### 3. Проверка целостности резервной копии

```bash
# Проверьте, что файл не пустой
file bookme.db.backup_*

# Проверьте размер (должен быть больше 0)
du -h bookme.db.backup_*

# Попробуйте открыть базу (проверка целостности)
sqlite3 bookme.db.backup_* "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"
```

### 4. Создание резервной копии с явным именем

Если хотите создать резервную копию с конкретным именем:

```bash
# Создайте резервную копию с текущей датой и временем
BACKUP_NAME="bookme.db.backup_$(date +%Y%m%d_%H%M%S)"
cp bookme.db "$BACKUP_NAME"
echo "Резервная копия создана: $BACKUP_NAME"

# Проверьте размер
ls -lh "$BACKUP_NAME"
```

### 5. Проверка содержимого базы данных

```bash
# Проверьте количество таблиц
sqlite3 bookme.db "SELECT COUNT(*) FROM sqlite_master WHERE type='table';"

# Проверьте количество пользователей
sqlite3 bookme.db "SELECT COUNT(*) FROM users;"

# Проверьте количество платежей (если таблица уже создана)
sqlite3 bookme.db "SELECT COUNT(*) FROM payments;" 2>/dev/null || echo "Таблица payments еще не создана"
```

---

## Если резервная копия не создалась

1. Проверьте права доступа:
   ```bash
   ls -la bookme.db
   ```

2. Проверьте, существует ли файл:
   ```bash
   ls -la bookme.db
   ```

3. Проверьте свободное место на диске:
   ```bash
   df -h
   ```

4. Создайте резервную копию вручную:
   ```bash
   cp bookme.db bookme.db.backup_manual_$(date +%Y%m%d_%H%M%S)
   ```


