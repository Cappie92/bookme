# Отладка: почему nc возвращает пустой ответ по HTTP

На эмуляторе Android нет curl/wget; проверка порта делается через `toybox nc`. Иногда `nc` по порту отвечает «OK», но HTTP-запрос через `printf "GET ..." | nc` возвращает пусто (нет заголовков). Ниже команды для zsh (без незакрытых скобок/кавычек в одну строку).

## 1. Проверка exit code и порта

```bash
adb shell toybox nc -z 127.0.0.1 8000
echo "exit=$?"
```

```bash
adb shell toybox nc -z 10.0.2.2 8000
echo "exit=$?"
```

Exit 0 — порт открыт.

## 2. Таймаут и чтение ответа (nc с -w)

Часть сборок `toybox nc` не закрывает соединение после ответа сервера, из-за чего кажется, что «ничего не пришло». Имеет смысл ограничить время ожидания и смотреть, что успело прийти.

Проверка, что на сокет что-то приходит (3 сек таймаут):

```bash
adb shell "echo 'GET /health HTTP/1.0\r\nHost: localhost\r\n\r\n' | toybox nc -w 3 127.0.0.1 8000 | head -20"
```

Через 10.0.2.2:

```bash
adb shell "echo 'GET /health HTTP/1.0\r\nHost: 10.0.2.2\r\n\r\n' | toybox nc -w 3 10.0.2.2 8000 | head -20"
```

Если в выводе пусто — возможные причины: nc не отправляет запрос сразу, сервер ждёт полного HTTP/1.1, или буфер не сбрасывается. Попробовать HTTP/1.1 с Connection: close:

```bash
adb shell "printf 'GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' | toybox nc -w 3 127.0.0.1 8000"
```

(В zsh `printf` с `\r\n` корректен.)

## 3. Запрос на / и /health

Корень:

```bash
adb shell "printf 'GET / HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' | toybox nc -w 3 127.0.0.1 8000"
```

Health:

```bash
adb shell "printf 'GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n' | toybox nc -w 3 127.0.0.1 8000"
```

## 4. Verbose (если поддерживается)

Некоторые toybox собирают nc с опцией -v:

```bash
adb shell toybox nc -w 3 -v 127.0.0.1 8000
```

Ввод вручную: затем ввести `GET /health HTTP/1.1` + Enter, `Host: localhost` + Enter, пустая строка + Enter. Смотреть, появляется ли ответ.

## Итог

Если через nc по-прежнему пусто, а с хоста `curl -i http://localhost:8000/health` отвечает — проблема в поведении nc/буферизации на эмуляторе. Надёжная проверка доступности API с устройства — встроенная диагностика в приложении (DEBUG_HTTP=1, экран public booking, блок [NET_DIAG]).
