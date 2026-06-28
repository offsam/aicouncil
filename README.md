# AI Consult

Next.js приложение для параллельного опроса Claude и GPT с формированием общего вывода.

## Запуск

1. Скопируйте `.env.local.example` в `.env.local` и заполните ключи:

```bash
cp .env.local.example .env.local
```

2. Установите зависимости и запустите dev-сервер:

```bash
npm install
npm run dev
```

3. Откройте [http://localhost:3000](http://localhost:3000).

## API

- `POST /api/ask-claude` — запрос к Claude (claude-sonnet-4-6)
- `POST /api/ask-gpt` — запрос к GPT (gpt-4o)
- `POST /api/consensus` — сравнение двух ответов через Claude
