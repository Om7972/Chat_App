CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS auth_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  "emailVerified" TIMESTAMPTZ,
  image TEXT
);

CREATE TABLE IF NOT EXISTS auth_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  type TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  access_token TEXT,
  expires_at BIGINT,
  refresh_token TEXT,
  id_token TEXT,
  scope TEXT,
  session_state TEXT,
  token_type TEXT,
  password TEXT,
  UNIQUE(provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires TIMESTAMPTZ NOT NULL,
  "sessionToken" TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_verification_token (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS chat_profiles (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#4f46e5',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  kind TEXT NOT NULL DEFAULT 'group',
  created_by TEXT REFERENCES chat_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES chat_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES chat_profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS message_reads (
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES chat_profiles(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (message_id, profile_id)
);

CREATE TABLE IF NOT EXISTS typing_state (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES chat_profiles(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
  ON conversations (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_members_profile_id
  ON conversation_members (profile_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_created_at
  ON chat_messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_reads_profile_id
  ON message_reads (profile_id);

CREATE INDEX IF NOT EXISTS idx_typing_state_expires_at
  ON typing_state (expires_at);

INSERT INTO chat_profiles (id, display_name, avatar_color)
VALUES ('system-bot', 'CreateXYZ Bot', '#0f766e')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  avatar_color = EXCLUDED.avatar_color,
  updated_at = NOW(),
  last_seen_at = NOW();

INSERT INTO conversations (slug, title, description, kind, created_by)
VALUES
  ('launchpad', 'Launchpad', 'Product updates, release notes, and launch coordination.', 'group', 'system-bot'),
  ('engineering', 'Engineering', 'Build discussions, incident follow-up, and API changes.', 'group', 'system-bot'),
  ('design-ops', 'Design Ops', 'Design reviews, UX feedback, and polish tracking.', 'group', 'system-bot')
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  kind = EXCLUDED.kind,
  updated_at = NOW();

INSERT INTO conversation_members (conversation_id, profile_id, role)
SELECT c.id, 'system-bot', 'owner'
FROM conversations c
ON CONFLICT (conversation_id, profile_id) DO NOTHING;

INSERT INTO chat_messages (conversation_id, sender_id, content)
SELECT c.id, 'system-bot',
  CASE c.slug
    WHEN 'launchpad' THEN 'Welcome to Launchpad. Use this room for product updates, deploy notes, and release callouts.'
    WHEN 'engineering' THEN 'Engineering is ready for API reviews, bug triage, and production work.'
    WHEN 'design-ops' THEN 'Design Ops is for UX feedback, accessibility notes, and finish-line polish.'
  END
FROM conversations c
WHERE NOT EXISTS (
  SELECT 1
  FROM chat_messages m
  WHERE m.conversation_id = c.id
);
