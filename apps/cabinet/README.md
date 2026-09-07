# @arcana/cabinet — Личный кабинет игрока

Отдельный сайт (Next.js, App Router), куда мобильное приложение уводит игрока для просмотра
статистики и покупки HARD-валюты через ЮKassa. Вход только по одноразовому коду из приложения
(`/auth/callback?code=...`), формы логина нет.

## Запуск

```bash
cp .env.local.example .env.local   # укажите API_BASE_URL вашего backend
pnpm --filter @arcana/cabinet dev  # http://localhost:3100
```

Backend (`apps/api`) должен быть запущен. Для сквозной проверки прогоните `python seed.py`
в `apps/api` — он создаёт демо-игрока `player@arcana.app` с прогрессом.

## Архитектура

- Сессия — httpOnly cookie (`arcana_cab_at` / `arcana_cab_rt`), выставляет серверный код.
- `proxy.ts` обновляет access-токен перед каждым запросом; страницы и route handler'ы просто
  читают cookie.
- Страницы с данными — server components, ходят в backend напрямую.
- `/api/checkout` и `/api/wallet` — тонкие same-origin route handler'ы для клиентских кнопок.
