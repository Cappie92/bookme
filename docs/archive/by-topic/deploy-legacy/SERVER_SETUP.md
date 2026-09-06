# Настройка сервера для Appointo

## 🎯 Цели
1. Выделить отдельное место на сервере
2. Настроить robots.txt для исключения из индексации
3. Создать структуру для обновлений

## 📋 Шаг 1: Подготовка сервера

### 1.1 Создание структуры папок
```bash
# На сервере
mkdir -p /home/user/appointo
cd /home/user/appointo
mkdir logs
```

### 1.2 Установка Docker (если не установлен)
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install docker.io docker-compose

# CentOS/RHEL
sudo yum install docker docker-compose

# Включить автозапуск
sudo systemctl enable docker
sudo systemctl start docker

# Добавить пользователя в группу docker
sudo usermod -aG docker $USER
```

### 1.3 Настройка SSH ключей (для автоматического деплоя)
```bash
# На локальной машине
ssh-keygen -t rsa -b 4096 -C "your-email@example.com"
ssh-copy-id user@your-server-ip
```

## 📋 Шаг 2: Настройка проекта

### 2.1 Обновление конфигурации
Отредактируйте файлы:
- `scripts/deploy.sh` - замените `your-server-ip` на реальный IP
- `scripts/update.sh` - замените `your-server-ip` на реальный IP

### 2.2 Настройка переменных окружения
Создайте файл `.env` на сервере:
```bash
# На сервере
cd /home/user/appointo
cat > .env << EOF
ENVIRONMENT=production
EOF
```

## 📋 Шаг 3: Первый деплой

### 3.1 Локальная подготовка
```bash
# На локальной машине
git add .
git commit -m "Initial deployment setup"
git push origin main
```

### 3.2 Деплой на сервер
```bash
# На локальной машине
chmod +x scripts/deploy.sh
./scripts/deploy.sh prod
```

### 3.3 Проверка деплоя
```bash
# На сервере
cd /home/user/appointo
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs
```


## 📋 Шаг 5: Настройка nginx (опционально)

### 5.1 Установка nginx
```bash
sudo apt install nginx
```

### 5.2 Конфигурация nginx
```bash
sudo nano /etc/nginx/sites-available/appointo
```

Добавьте:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5.3 Активация сайта
```bash
sudo ln -s /etc/nginx/sites-available/appointo /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## 📋 Шаг 6: Настройка SSL (опционально)

### 6.1 Установка Certbot
```bash
sudo apt install certbot python3-certbot-nginx
```

### 6.2 Получение SSL сертификата
```bash
sudo certbot --nginx -d your-domain.com
```

## 🔄 Процесс обновлений

### Автоматическое обновление
```bash
# На локальной машине
./scripts/update.sh
```

### Ручное обновление
```bash
# На сервере
cd /home/user/appointo
git pull origin main
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

## 📊 Мониторинг

### Просмотр логов
```bash
# На сервере
cd /home/user/appointo
docker-compose -f docker-compose.prod.yml logs -f
```

### Проверка статуса
```bash
# На сервере
docker-compose -f docker-compose.prod.yml ps
```

### Health check
```bash
curl http://your-server-ip/health
```

## 🛡️ Безопасность

### Firewall
```bash
# На сервере
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow 22
sudo ufw enable
```

### Обновление системы
```bash
# На сервере
sudo apt update && sudo apt upgrade -y
```

## 📝 Чек-лист деплоя

- [ ] Создана структура папок на сервере
- [ ] Установлен Docker и Docker Compose
- [ ] Настроены SSH ключи
- [ ] Обновлены конфигурации скриптов
- [ ] Выполнен первый деплой
- [ ] Проверена работа приложения
- [ ] Настроен nginx (опционально)
- [ ] Настроен SSL (опционально)
- [ ] Настроен firewall
- [ ] Протестированы обновления
