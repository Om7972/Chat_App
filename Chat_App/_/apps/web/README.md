# CreateXYZ Messenger Web

Production-oriented chat workspace built on React Router 7, React Query, and Neon Postgres.

## Implemented

- Multi-room chat layout inspired by WhatsApp and Telegram
- Persistent browser identity with editable display name
- Conversation unread counts, read receipts, and delivery state
- Typing indicators and presence heartbeat
- Per-room draft persistence and searchable room list
- Database-backed health endpoint at `/api/health`

## Environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`

## Local setup

```bash
npm ci
npm run migrate
npm run dev
```

## Production

```bash
npm ci
npm run migrate
npm run build
npm run start
```

## Docker

```bash
docker build -t createxyz-chat-web .
docker run --env-file .env -p 3000:3000 createxyz-chat-web
```

## Recommended next scaling steps

1. Replace polling with WebSockets or Server-Sent Events.
2. Add Redis for fan-out, rate limiting, and ephemeral presence state.
3. Add object storage plus CDN for media delivery.
4. Put migrations under a managed migration tool such as Prisma Migrate, Drizzle Kit, or Flyway.
