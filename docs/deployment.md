# Развёртывание College Portal в контейнерах

## Архитектура

```
                ┌───────────────┐
   :80/:443 ───▶│  caddy (opt.) │  автоматический HTTPS (Let's Encrypt)
                └──────┬────────┘
                       │
                ┌──────▼────────┐
       :8080 ──▶│   web (nginx) │  SPA + прокси /api → api:8080
                └──────┬────────┘
                       │  internal docker network
                ┌──────▼────────┐        ┌──────────────┐
                │   api (.NET)  │───────▶│ db (Postgres)│
                └───────────────┘        └──────────────┘
```

- **web** — статически собранный React-SPA (nginx). Запросы к `/api/*` проксируются на **api**.
- **api** — ASP.NET Core. При старте применяет EF-миграции (`Database__AutoMigrate=true`) и создаёт роли + администратора.
- **db** — PostgreSQL 16 (лёгкий, ~150 МБ RAM).
- **caddy** — опционально: терминирует TLS и раздаёт HTTPS на вашем домене.

Всё общение браузера с API идёт через тот же домен (`/api`), поэтому CORS и
`SameSite`-куки работают без дополнительных настроек.

## 1. Предпосылки

- Docker Engine 24+ и Docker Compose v2 (`docker compose`).
- Минимум ~512 МБ RAM (PostgreSQL потребляет немного).
- Свободные порты (по умолчанию `8080` для web; `80`/`443` при включённом HTTPS).

## 2. Подготовка

```bash
# клонировать репозиторий и перейти в него
git clone <repo-url> collegium && cd collegium

# создать .env из шаблона и заполнить секреты
cp .env.example .env
```

В `.env` обязательно задайте:

| Переменная         | Назначение                                                        |
|--------------------|-------------------------------------------------------------------|
| `POSTGRES_PASSWORD`| Пароль суперпользователя PostgreSQL (любая непустая строка).      |
| `JWT_KEY`          | Ключ подписи JWT, **минимум 32 байта**. `openssl rand -base64 48`.|
| `ADMIN_EMAIL`      | E-mail/логин bootstrap-администратора.                           |
| `ADMIN_PASSWORD`   | Пароль администратора (мин. 8 символов).                         |
| `WEB_PORT`         | Порт хоста, на котором доступен сайт (по умолчанию 8080).        |
| `PUBLIC_ORIGIN`    | Публичный origin для CORS (например `https://portal.example.com`).|

> `.env` в `.gitignore` — никогда не коммитьте его.

## 3. Сборка и запуск

```bash
# сборка образов и запуск стека (db + api + web)
docker compose up -d --build

# логи (проверить, что миграции применились и админ создан)
docker compose logs -f api
```

Приложение будет доступно на `http://<host>:8080`.

Проверка:

```bash
# SPA отвечает
curl -I http://localhost:8080

# API жив (401 без авторизации — это ожидаемо)
curl -i http://localhost:8080/api/auth/me
```

## 4. Свой домен

### Вариант A — автоматический HTTPS через Caddy (рекомендуется)

1. В DNS вашего домена создайте запись **A** (и `AAAA`, если есть IPv6),
   указывающую на IP сервера:
   ```
   portal.example.com.   A   203.0.113.10
   ```
2. В `.env` укажите:
   ```
   CADDY_DOMAIN=portal.example.com
   PUBLIC_ORIGIN=https://portal.example.com
   ```
3. Откройте порты 80 и 443, затем запустите профиль `tls`:
   ```bash
   docker compose --profile tls up -d --build
   ```
   Caddy сам получит и будет продлевать сертификат Let's Encrypt.
   Готово: `https://portal.example.com`.

### Вариант B — свой reverse proxy на хосте

Если на сервере уже есть nginx/Apache/Traefik:

1. Оставьте контейнер `web` на `WEB_PORT` (например `8080`).
2. Проксируйте домен на `http://127.0.0.1:8080`, передавая заголовки
   `Host`, `X-Forwarded-For`, `X-Forwarded-Proto`.
3. TLS (certbot) настраивается на хосте.

Пример конфига nginx на хосте:

```nginx
server {
    listen 443 ssl;
    server_name portal.example.com;

    ssl_certificate     /etc/letsencrypt/live/portal.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/portal.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

> Учтите: в Production cookie авторизации помечается `Secure`, поэтому сайт
> должен открываться по **HTTPS** — иначе браузер не сохранит куку входа.

### Вариант C — без домена (IP-адрес)

Просто задайте `PUBLIC_ORIGIN=http://<IP>:8080` и используйте
`http://<IP>:8080`. HTTPS при этом не будет — для боевого использования
настоятельно рекомендуется вариант A или B.

## 5. Обновление версии

```bash
git pull
docker compose up -d --build
```

Миграции применятся автоматически при старте `api`.

## 6. Резервное копирование

Данные PostgreSQL лежат в томе `pgdata`. Сделать дамп:

```bash
docker compose exec db pg_dump -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-CollegePortal}" -F c \
  -f /tmp/collegeportal.dump
docker compose cp db:/tmp/collegeportal.dump ./backup/
```

Восстановление:

```bash
docker compose cp ./backup/collegeportal.dump db:/tmp/collegeportal.dump
docker compose exec db pg_restore -U "${POSTGRES_USER:-postgres}" -d "${POSTGRES_DB:-CollegePortal}" --clean --if-exists /tmp/collegeportal.dump
```

Ключи Data Protection лежат в томе `dpkeys` — без них после потери тома
невозможно расшифровать данные дневника, поэтому их тоже стоит бэкапить.

## 7. Полезные команды

```bash
docker compose ps                 # статус контейнеров
docker compose logs -f api        # логи бэкенда
docker compose down               # остановить
docker compose down -v            # остановить и УДАЛИТЬ данные (осторожно)
```
