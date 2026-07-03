# CreateXYZ Apps

This workspace contains the application surfaces for CreateXYZ Messenger.

## Web

The web app lives in `_/apps/web` and now includes:

- premium multi-room chat UX
- replies, reactions, saved messages, and personal saved room
- pinned, muted, and archived room controls
- presence, typing, unread counts, and read receipts
- PWA installability with offline fallback
- production build, start, migrate, and healthcheck flows

## Run the web app

```bash
cd _/apps/web
npm ci
npm run migrate
npm run dev
```

## Production

```bash
cd _/apps/web
npm run build
npm run start
```
