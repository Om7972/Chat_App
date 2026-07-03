# CreateXYZ Messenger Web

Production-oriented chat workspace built on React Router 7, React Query, and Neon Postgres.

## Premium features

- Multi-room messaging inspired by WhatsApp and Telegram
- Reply context, reactions, saved messages, and personal saved room
- Pinned, muted, and archived conversation controls
- Presence heartbeat, typing state, unread counts, and read receipts
- Search across rooms and inside the active conversation
- Installable PWA shell with offline fallback
- Health endpoint at `/api/health`

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

## Scaling path

1. Replace polling with WebSockets or SSE.
2. Add Redis for fan-out, presence, queue-backed delivery, and rate limiting.
3. Add object storage plus CDN for attachments, voice notes, and images.
4. Add managed DB migrations and CI deploy gates.
