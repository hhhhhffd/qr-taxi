# APARU QR Taxi

**APARU** — мультиплатформенный сервис заказа такси по QR-коду для Казахстана. Пассажир сканирует QR-стикер на остановке или в лобби — и попадает прямо в интерфейс заказа без установки приложения. Поддерживаются три точки входа: Telegram Mini App, WeChat H5 и веб-браузер. Единый бэкенд управляет жизненным циклом заказа через детерминированный стейт-машин, транслируя изменения статуса в реальном времени через WebSocket + Redis Pub/Sub.

---

## Технический стек

| Категория | Технологии |
|-----------|-----------|
| **Core** | FastAPI 0.115, Python 3.12, Uvicorn (ASGI) |
| **Frontend** | React 18, TypeScript 5.6, Vite 6, Tailwind CSS 3 |
| **Data** | PostgreSQL 16 (asyncpg + SQLAlchemy 2 async), Alembic |
| **Cache / Pub-Sub** | Redis 7 (hiredis), asyncio worker |
| **Maps** | Aparu Maps API (геокодирование + маршруты, Казахстан), Leaflet / react-leaflet |
| **Messaging** | aiogram 3 (Telegram Bot API, webhook mode) |
| **Auth** | Telegram initData HMAC-SHA256, JWT (access + refresh httpOnly cookie), Phone OTP |
| **Analytics** | Metabase (signed iframe embed) |
| **i18n** | i18next (ru / en / zh) |
| **Infra** | Docker Compose, Nginx (Alpine), Cloudflare Tunnel |

---

## Архитектура системы

### Общая схема потока данных

```mermaid
flowchart TD
    QR["📱 QR-стикер\n/go/{slug}"]

    subgraph UA["Определение платформы (User-Agent)"]
        GO["/go/{slug}\nPlatform Router"]
    end

    subgraph Clients["Клиенты"]
        TG["Telegram\nMini App"]
        WE["WeChat H5\n/we/"]
        WEB["Веб-браузер\n/"]
    end

    subgraph Nginx["Nginx :80"]
        N_API["/api/ → api:8000"]
        N_WS["/ws/ → api:8000 (upgrade)"]
        N_WE["/we/ → frontend:80"]
        N_FRONT["/ → frontend:80"]
        N_META["/metabase/ → metabase:3000"]
    end

    subgraph Backend["FastAPI (api:8000)"]
        AUTH["Auth\n/api/auth/telegram\n/api/auth/otp\n/api/auth/wechat"]
        ORDERS["Orders API\n/api/orders/"]
        GEO["Geo API\n/api/geo/"]
        ADMIN["Admin API\n/api/admin/"]
        WS["WebSocket\n/ws/orders/{id}"]
        WORKER["Background Worker\nasyncio · 5s tick"]
    end

    subgraph Storage["Хранилища"]
        PG[("PostgreSQL :5432\nDB: aparu")]
        RD[("Redis :6379\nCache + Pub/Sub")]
    end

    BOT["aiogram\nTelegram Bot"]
    META["Metabase :3001"]
    APARU_API["Aparu Maps API\ntesttaxi3.aparu.kz"]
    CF["Cloudflare Tunnel\ncloudflared"]

    QR --> GO
    GO -- "MicroMessenger UA" --> WE
    GO -- "иные UA" --> TG
    GO -- "fallback JS 1.5s" --> WEB

    TG & WE & WEB --> Nginx
    Nginx --> N_API & N_WS & N_WE & N_FRONT & N_META
    N_API --> AUTH & ORDERS & GEO & ADMIN
    N_WS --> WS
    CF --> Nginx

    ORDERS --> PG & RD
    AUTH --> PG
    GEO --> APARU_API
    GEO --> RD
    WS --> RD
    WORKER --> PG & RD & BOT
    META --> PG
```

### Стейт-машин заказа

```mermaid
stateDiagram-v2
    [*] --> searching : POST /api/orders/

    searching --> driver_assigned : worker: найден водитель
    searching --> no_drivers      : worker: таймаут поиска

    no_drivers --> searching      : пользователь: повтор
    no_drivers --> cancelled      : пользователь: отмена

    driver_assigned --> driver_arriving : worker: немедленно

    driver_arriving --> driver_arrived : worker: ETA истёк
    driver_arriving --> cancelled      : пользователь / система

    driver_arrived --> ride_started : worker: задержка посадки
    driver_arrived --> cancelled    : worker: таймаут ожидания

    ride_started --> ride_completed : worker: длительность поездки

    ride_completed --> [*]
    cancelled --> [*]
```

**Ключевые детали:**
- Каждый переход атомарно записывается в `order_events` и публикуется в Redis канал `aparu:order:{id}`.
- `order_worker` — stateless asyncio-цикл (5 сек). При рестарте восстанавливает состояние из временны́х меток БД — не из памяти.
- WebSocket-эндпоинт `/ws/orders/{id}` подписывается на Redis Pub/Sub и форвардит события клиенту; для location-апдейтов — линейная интерполяция координат водителя → точка А.

### Поток аутентификации

```mermaid
sequenceDiagram
    participant Client as Клиент (TMA/Web/WeChat)
    participant API as FastAPI /api/auth/
    participant DB as PostgreSQL
    participant Redis as Redis

    Client->>API: POST /telegram {init_data}
    API->>API: HMAC-SHA256 validate (BOT_TOKEN)
    API->>DB: UPSERT users (telegram_id)
    API-->>Client: {access_token, user} + Set-Cookie: refresh_token (httpOnly)

    Note over Client,API: Последующие запросы
    Client->>API: Bearer access_token
    API->>API: verify JWT (HS256)
    API-->>Client: 200 OK

    Note over Client,API: Ротация токенов
    Client->>API: POST /refresh (cookie)
    API->>DB: load user
    API-->>Client: new access_token + new refresh cookie

    Note over Client,API: OTP (web/WeChat)
    Client->>API: POST /otp/request {phone}
    API->>Redis: store OTP, TTL 5min
    Client->>API: POST /otp/verify {phone, otp}
    API->>Redis: validate OTP
    API->>DB: UPSERT users (phone, platform=web|wechat)
    API-->>Client: {access_token, user}
```

### Поток QR → заказ

```mermaid
sequenceDiagram
    participant User as Пользователь
    participant QR as QR-стикер /go/{slug}
    participant Router as Platform Router
    participant App as Мини-приложение
    participant API as FastAPI
    participant Worker as Order Worker
    participant WS as WebSocket
    participant Bot as Telegram Bot

    User->>QR: сканирование
    QR->>Router: GET /go/{slug} [UA header]
    Router->>Router: slug валидация в БД
    alt WeChat UA
        Router-->>App: 302 /we/?slug=...
    else Telegram/Browser
        Router-->>User: HTML (deep-link + JS fallback 1.5s)
    end

    App->>API: POST /api/auth/telegram
    API-->>App: JWT + user profile
    App->>API: POST /api/orders/ {location_slug, tariff, point_b?}
    API->>API: стейт-машин: searching
    API-->>App: 201 Created {order_id, status: "searching"}

    App->>WS: WS /ws/orders/{id}?token=...
    WS-->>App: полный снапшот order (on connect)

    loop Worker tick 5s
        Worker->>Worker: _process_searching
        Worker->>API: transition → driver_assigned → driver_arriving
        Worker->>WS: Redis PUBLISH aparu:order:{id}
        WS-->>App: status_update + driver brief
        Worker->>Bot: send_driver_assigned (Telegram уведомление)
        Worker->>WS: PUBLISH driver_location (интерполяция)
        WS-->>App: driver_location (карта)
    end

    Worker->>API: transition → ride_completed
    Worker->>Bot: send_ride_completed (финальная цена)
    App->>API: POST /api/orders/{id}/rate
```

---

## ADR — Архитектурные решения

**ADR-1: FastAPI вместо Django/Flask**
FastAPI выбран из-за нативной поддержки `async/await` — критично для конкурентных WebSocket-соединений и неблокирующего Redis Pub/Sub. Django ORM не поддерживает полностью асинхронные сессии; SQLAlchemy 2 async + asyncpg даёт нативный async PostgreSQL.

**ADR-2: Redis Pub/Sub для real-time вместо polling**
Клиентский polling создал бы O(N) нагрузку на БД при N активных заказах. Redis Pub/Sub канал `aparu:order:{id}` позволяет worker'у публиковать событие один раз, а всем подписчикам (WS-соединения пользователя + share-link) получить его мгновенно. Worker stateless — при краше не теряет состояние, восстанавливается по timestamp-колонкам в БД.

**ADR-3: Единый SPA для Telegram, WeChat и веба**
Три точки входа (TG Mini App, WeChat H5 `/we/`, браузер `/`) обслуживаются одним React SPA. Nginx маршрутизирует `/we/` к тому же контейнеру frontend, React Router обрабатывает `basename=/we` через env. Это исключает дублирование кода при поддержке трёх платформ с разными auth-флоу.

**ADR-4: Cloudflare Tunnel вместо входящих портов**
APARU развёртывается без открытых входящих портов на хосте. `cloudflared` устанавливает outbound-туннель к Cloudflare, что устраняет необходимость в белом IP и публичном открытии портов — актуально для VPS-хостинга в Казахстане. Nginx остаётся на порту 80 для локальной разработки.

---

## Запуск через Docker Compose

### 1. Клонирование и конфигурация

```bash
git clone <repo_url>
cd aparu

cp .env.example .env
```

### 2. Заполнение `.env`

Откройте `.env` и задайте обязательные переменные:

```dotenv
# --- PostgreSQL ---
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secure_postgres_password       # openssl rand -base64 32
POSTGRES_DB=aparu
DATABASE_URL=postgresql+asyncpg://postgres:secure_postgres_password@postgres:5432/aparu

# --- Redis ---
REDIS_PASSWORD=secure_redis_password             # openssl rand -base64 32
REDIS_URL=redis://:secure_redis_password@redis:6379/0

# --- Telegram Bot ---
BOT_TOKEN=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZ   # BotFather → /newbot
BOT_USERNAME=aparu_bot
WEBHOOK_SECRET=your_secure_webhook_secret        # openssl rand -hex 32

# --- Aparu Maps API ---
APARU_API_KEY=your_aparu_api_key
APARU_API_URL=http://testtaxi3.aparu.kz

# --- JWT ---
JWT_SECRET=your_secure_jwt_secret                # openssl rand -hex 32
JWT_ALGORITHM=HS256
JWT_ACCESS_EXPIRE_MINUTES=1440
JWT_REFRESH_EXPIRE_DAYS=7

# --- Инфраструктура ---
DOMAIN=your_domain.com
DEBUG=False
TUNNEL_TOKEN=your_cloudflare_tunnel_token        # Cloudflare Dashboard → Tunnels

# --- Metabase ---
METABASE_SITE_URL=/metabase
METABASE_PUBLIC_SITE_URL=https://your_domain.com/metabase
METABASE_EMBED_SECRET=your_metabase_embedding_secret
METABASE_DASHBOARD_ID=1
```

> **Telegram Webhook**: бот регистрирует webhook автоматически при старте (`setup_webhook` в lifespan). Требуется публичный HTTPS домен — используйте Cloudflare Tunnel или `DOMAIN=your_domain.com`.

### 3. Запуск

```bash
docker compose up -d
```

Порядок запуска контейнеров (healthcheck-зависимости):
```
postgres (healthy) ┐
                   ├─→ api → nginx → cloudflared
redis    (healthy) ┘
                   └─→ metabase
frontend           ─→ nginx
```

### 4. Миграции базы данных

```bash
# Применить все миграции (выполняется из директории проекта)
docker compose exec api alembic upgrade head
```

При первом старте `seed_database` автоматически наполняет БД начальными данными (водители, локации, тарифы).

### 5. Проверка работоспособности

```bash
curl http://localhost/api/health
# → {"status":"ok","service":"aparu-api"}

# Список локаций
curl http://localhost/api/locations/

# Metabase
open http://localhost/metabase
```
### 6. Выдача админа

```bash
UPDATE users SET is_admin = true WHERE phone = "+7 777 777 7777";
```

### Маршруты Nginx

| Путь | Назначение |
|------|-----------|
| `/api/*` | FastAPI REST API |
| `/ws/*` | WebSocket (с Upgrade) |
| `/go/{slug}` | Platform Router (QR landing) |
| `/we/*` | WeChat H5 SPA |
| `/metabase/*` | Metabase embed |
| `/assets/*` | Статика фронтенда (immutable cache) |
| `/` | React SPA (no-cache) |

---

## Структура проекта

```
aparu/
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI роутеры (auth, orders, geo, admin, ws, go)
│   │   ├── bot/          # aiogram бот (handlers, webhook)
│   │   ├── models/       # SQLAlchemy ORM модели
│   │   ├── schemas/      # Pydantic схемы (request/response)
│   │   ├── services/     # Бизнес-логика (auth, order, geo, tariff, qr, share)
│   │   ├── worker/       # Background worker (order lifecycle state machine)
│   │   ├── config.py     # pydantic-settings
│   │   ├── database.py   # async SQLAlchemy engine + session factory
│   │   └── redis.py      # Redis connection pool + cache helpers
│   ├── alembic/          # Миграции БД
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/          # axios клиент + эндпоинты
│       ├── components/   # UI компоненты
│       ├── pages/        # Страницы (заказ, карта, история)
│       ├── stores/       # Zustand state management
│       ├── hooks/        # React хуки (WebSocket, геолокация)
│       └── i18n.ts       # Конфигурация i18next (ru/en/zh)
├── nginx/
│   └── nginx.conf        # Reverse proxy конфигурация
├── docker-compose.yml
└── .env.example
```

---

## Ссылки

*Soon...*
