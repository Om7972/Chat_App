import sql from '@/app/api/utils/sql';

const DEFAULT_CONVERSATIONS = [
  {
    slug: 'launchpad',
    title: 'Launchpad',
    description: 'Product updates, release notes, and launch coordination.',
    welcome:
      'Welcome to Launchpad. Use this room for product updates, deploy notes, and release callouts.',
  },
  {
    slug: 'engineering',
    title: 'Engineering',
    description: 'Build discussions, incident follow-up, and API changes.',
    welcome: 'Engineering is ready for API reviews, bug triage, and production work.',
  },
  {
    slug: 'design-ops',
    title: 'Design Ops',
    description: 'Design reviews, UX feedback, and polish tracking.',
    welcome: 'Design Ops is for UX feedback, accessibility notes, and finish-line polish.',
  },
  {
    slug: 'saved',
    title: 'Saved Messages',
    description: 'Private reminders, links, and notes saved from chats.',
    welcome: 'This room keeps your saved highlights and personal notes in one place.',
    kind: 'direct',
    selfOnly: true,
  },
];

function getConversationSlug(profileId, conversation) {
  return conversation.selfOnly ? `saved-${profileId}` : conversation.slug;
}

function normalizeReactions(reactions) {
  if (Array.isArray(reactions)) return reactions;
  if (typeof reactions === 'string') {
    try {
      const parsed = JSON.parse(reactions);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function normalizeProfile(input) {
  const fallbackNames = ['North Star', 'Blue Orbit', 'Signal Desk', 'Quiet River'];
  const id = String(input?.profileId || '').trim();
  const displayName = String(input?.displayName || '').trim().slice(0, 48);
  const avatarColor = String(input?.avatarColor || '').trim().slice(0, 16);

  if (!id) {
    throw new Error('profileId is required');
  }

  return {
    id,
    displayName: displayName || fallbackNames[Math.floor(Math.random() * fallbackNames.length)],
    avatarColor: avatarColor || '#4f46e5',
  };
}

export async function ensureProfile(profile) {
  await sql`
    INSERT INTO chat_profiles (id, display_name, avatar_color, updated_at, last_seen_at)
    VALUES (${profile.id}, ${profile.displayName}, ${profile.avatarColor}, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      display_name = EXCLUDED.display_name,
      avatar_color = EXCLUDED.avatar_color,
      updated_at = NOW(),
      last_seen_at = NOW()
  `;
}

export async function touchPresence(profileId) {
  await sql`
    UPDATE chat_profiles
    SET last_seen_at = NOW(), updated_at = NOW()
    WHERE id = ${profileId}
  `;
}

export async function ensureChatSchema() {
  await sql`ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_muted BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE`;
  await sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS parent_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL`;

  await sql`
    CREATE TABLE IF NOT EXISTS message_reactions (
      message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES chat_profiles(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, profile_id, emoji)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS saved_messages (
      message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
      profile_id TEXT NOT NULL REFERENCES chat_profiles(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (message_id, profile_id)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_chat_messages_parent_message_id ON chat_messages (parent_message_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_message_reactions_message_id ON message_reactions (message_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_saved_messages_profile_id ON saved_messages (profile_id)`;
}

export async function ensureDefaultConversations(profileId) {
  await ensureChatSchema();

  await sql`
    INSERT INTO chat_profiles (id, display_name, avatar_color, updated_at, last_seen_at)
    VALUES ('system-bot', 'CreateXYZ Bot', '#0f766e', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      updated_at = NOW(),
      last_seen_at = NOW()
  `;

  for (const conversation of DEFAULT_CONVERSATIONS) {
    const slug = getConversationSlug(profileId, conversation);

    await sql`
      INSERT INTO conversations (slug, title, description, kind, created_by, updated_at)
      VALUES (
        ${slug},
        ${conversation.title},
        ${conversation.description},
        ${conversation.kind || 'group'},
        'system-bot',
        NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        kind = EXCLUDED.kind
    `;

    const [storedConversation] = await sql`
      SELECT id
      FROM conversations
      WHERE slug = ${slug}
      LIMIT 1
    `;

    await sql`
      INSERT INTO conversation_members (conversation_id, profile_id, role)
      VALUES (${storedConversation.id}, 'system-bot', 'owner')
      ON CONFLICT (conversation_id, profile_id) DO NOTHING
    `;

    await sql`
      INSERT INTO conversation_members (conversation_id, profile_id, role)
      VALUES (${storedConversation.id}, ${profileId}, ${conversation.selfOnly ? 'owner' : 'member'})
      ON CONFLICT (conversation_id, profile_id) DO NOTHING
    `;

    const existingMessages = await sql`
      SELECT id
      FROM chat_messages
      WHERE conversation_id = ${storedConversation.id}
      LIMIT 1
    `;

    if (existingMessages.length === 0) {
      await sql`
        INSERT INTO chat_messages (conversation_id, sender_id, content)
        VALUES (${storedConversation.id}, 'system-bot', ${conversation.welcome})
      `;
    }
  }
}

export async function getConversationList(profileId) {
  return sql`
    SELECT
      c.id,
      c.slug,
      c.title,
      c.description,
      c.kind,
      c.updated_at,
      cm.is_pinned,
      cm.is_muted,
      cm.is_archived,
      (
        SELECT COUNT(*)
        FROM chat_messages unread
        LEFT JOIN message_reads mr
          ON mr.message_id = unread.id
          AND mr.profile_id = ${profileId}
        WHERE unread.conversation_id = c.id
          AND unread.sender_id <> ${profileId}
          AND mr.message_id IS NULL
      )::int AS unread_count,
      (
        SELECT COUNT(*)
        FROM saved_messages sm
        INNER JOIN chat_messages m ON m.id = sm.message_id
        WHERE sm.profile_id = ${profileId}
          AND m.conversation_id = c.id
      )::int AS saved_count,
      latest.id AS latest_message_id,
      latest.content AS latest_message_content,
      latest.created_at AS latest_message_created_at,
      sender.display_name AS latest_message_sender_name
    FROM conversations c
    INNER JOIN conversation_members cm
      ON cm.conversation_id = c.id
      AND cm.profile_id = ${profileId}
    LEFT JOIN LATERAL (
      SELECT id, content, sender_id, created_at
      FROM chat_messages
      WHERE conversation_id = c.id
      ORDER BY created_at DESC
      LIMIT 1
    ) latest ON true
    LEFT JOIN chat_profiles sender ON sender.id = latest.sender_id
    ORDER BY
      cm.is_archived ASC,
      cm.is_pinned DESC,
      cm.is_muted ASC,
      COALESCE(latest.created_at, c.updated_at) DESC,
      c.title ASC
  `;
}

export async function getConversationMessages(conversationId, profileId) {
  return sql`
    SELECT
      m.id,
      m.conversation_id,
      m.sender_id,
      p.display_name AS sender_name,
      p.avatar_color AS sender_color,
      p.last_seen_at,
      m.content,
      m.status,
      m.created_at,
      m.edited_at,
      m.parent_message_id,
      parent.content AS parent_content,
      parent.sender_id AS parent_sender_id,
      parent_profile.display_name AS parent_sender_name,
      EXISTS (
        SELECT 1
        FROM message_reads mr
        WHERE mr.message_id = m.id
          AND mr.profile_id = ${profileId}
      ) AS is_read_by_viewer,
      (
        SELECT COUNT(*)
        FROM message_reads mr
        WHERE mr.message_id = m.id
          AND mr.profile_id <> m.sender_id
      )::int AS read_count,
      EXISTS (
        SELECT 1
        FROM saved_messages sm
        WHERE sm.message_id = m.id
          AND sm.profile_id = ${profileId}
      ) AS is_saved,
      COALESCE((
        SELECT json_agg(
          json_build_object(
            'emoji', grouped.emoji,
            'count', grouped.reaction_count,
            'reactedByMe', grouped.reacted_by_me
          )
          ORDER BY grouped.emoji
        )
        FROM (
          SELECT
            mr.emoji,
            COUNT(*)::int AS reaction_count,
            BOOL_OR(mr.profile_id = ${profileId}) AS reacted_by_me
          FROM message_reactions mr
          WHERE mr.message_id = m.id
          GROUP BY mr.emoji
        ) grouped
      ), '[]'::json) AS reactions
    FROM chat_messages m
    INNER JOIN chat_profiles p ON p.id = m.sender_id
    LEFT JOIN chat_messages parent ON parent.id = m.parent_message_id
    LEFT JOIN chat_profiles parent_profile ON parent_profile.id = parent.sender_id
    WHERE m.conversation_id = ${conversationId}
    ORDER BY m.created_at ASC
    LIMIT 150
  `;
}

export async function getConversationParticipants(conversationId) {
  return sql`
    SELECT
      p.id,
      p.display_name,
      p.avatar_color,
      p.last_seen_at,
      cm.role,
      cm.joined_at
    FROM conversation_members cm
    INNER JOIN chat_profiles p ON p.id = cm.profile_id
    WHERE cm.conversation_id = ${conversationId}
    ORDER BY
      CASE WHEN cm.role = 'owner' THEN 0 ELSE 1 END,
      p.display_name ASC
  `;
}

export async function getTypingState(conversationId, profileId) {
  return sql`
    SELECT
      ts.profile_id,
      p.display_name,
      p.avatar_color
    FROM typing_state ts
    INNER JOIN chat_profiles p ON p.id = ts.profile_id
    WHERE ts.conversation_id = ${conversationId}
      AND ts.profile_id <> ${profileId}
      AND ts.expires_at > NOW()
    ORDER BY p.display_name ASC
  `;
}

export async function markConversationRead(conversationId, profileId) {
  await sql`
    INSERT INTO message_reads (message_id, profile_id, read_at)
    SELECT m.id, ${profileId}, NOW()
    FROM chat_messages m
    WHERE m.conversation_id = ${conversationId}
      AND m.sender_id <> ${profileId}
    ON CONFLICT (message_id, profile_id) DO UPDATE SET
      read_at = EXCLUDED.read_at
  `;

  await sql`
    UPDATE conversation_members
    SET last_seen_at = NOW()
    WHERE conversation_id = ${conversationId}
      AND profile_id = ${profileId}
  `;
}

export async function ensureMembership(conversationId, profileId) {
  const existing = await sql`
    SELECT conversation_id
    FROM conversation_members
    WHERE conversation_id = ${conversationId}
      AND profile_id = ${profileId}
    LIMIT 1
  `;

  if (existing.length === 0) {
    throw new Error('Conversation membership not found');
  }
}

export async function sendMessage({ conversationId, profileId, content, parentMessageId = null }) {
  if (parentMessageId) {
    const parentRows = await sql`
      SELECT id
      FROM chat_messages
      WHERE id = ${parentMessageId}
        AND conversation_id = ${conversationId}
      LIMIT 1
    `;

    if (parentRows.length === 0) {
      throw new Error('Reply target not found in this conversation');
    }
  }

  const [message] = await sql`
    INSERT INTO chat_messages (conversation_id, sender_id, content, parent_message_id)
    VALUES (${conversationId}, ${profileId}, ${content}, ${parentMessageId})
    RETURNING id, conversation_id, sender_id, content, status, created_at, edited_at, parent_message_id
  `;

  await sql`
    UPDATE conversations
    SET updated_at = NOW()
    WHERE id = ${conversationId}
  `;

  await sql`
    DELETE FROM typing_state
    WHERE conversation_id = ${conversationId}
      AND profile_id = ${profileId}
  `;

  await sql`
    INSERT INTO message_reads (message_id, profile_id, read_at)
    VALUES (${message.id}, ${profileId}, NOW())
    ON CONFLICT (message_id, profile_id) DO UPDATE SET
      read_at = EXCLUDED.read_at
  `;

  return message;
}

export async function createConversation({ profileId, title, description }) {
  const [conversation] = await sql`
    INSERT INTO conversations (title, description, kind, created_by, updated_at)
    VALUES (${title}, ${description}, 'group', ${profileId}, NOW())
    RETURNING id, title, description, kind, slug, updated_at
  `;

  await sql`
    INSERT INTO conversation_members (conversation_id, profile_id, role)
    VALUES (${conversation.id}, ${profileId}, 'owner')
    ON CONFLICT (conversation_id, profile_id) DO NOTHING
  `;

  return conversation;
}

export async function setConversationPreferences({ conversationId, profileId, isPinned, isMuted, isArchived }) {
  await sql`
    UPDATE conversation_members
    SET
      is_pinned = COALESCE(${isPinned}, is_pinned),
      is_muted = COALESCE(${isMuted}, is_muted),
      is_archived = COALESCE(${isArchived}, is_archived)
    WHERE conversation_id = ${conversationId}
      AND profile_id = ${profileId}
  `;
}

export async function toggleReaction({ messageId, profileId, emoji }) {
  const existing = await sql`
    SELECT message_id
    FROM message_reactions
    WHERE message_id = ${messageId}
      AND profile_id = ${profileId}
      AND emoji = ${emoji}
    LIMIT 1
  `;

  if (existing.length > 0) {
    await sql`
      DELETE FROM message_reactions
      WHERE message_id = ${messageId}
        AND profile_id = ${profileId}
        AND emoji = ${emoji}
    `;
    return { active: false };
  }

  await sql`
    INSERT INTO message_reactions (message_id, profile_id, emoji)
    VALUES (${messageId}, ${profileId}, ${emoji})
    ON CONFLICT (message_id, profile_id, emoji) DO NOTHING
  `;
  return { active: true };
}

export async function toggleSavedMessage({ messageId, profileId }) {
  const existing = await sql`
    SELECT message_id
    FROM saved_messages
    WHERE message_id = ${messageId}
      AND profile_id = ${profileId}
    LIMIT 1
  `;

  if (existing.length > 0) {
    await sql`
      DELETE FROM saved_messages
      WHERE message_id = ${messageId}
        AND profile_id = ${profileId}
    `;
    return { saved: false };
  }

  await sql`
    INSERT INTO saved_messages (message_id, profile_id)
    VALUES (${messageId}, ${profileId})
    ON CONFLICT (message_id, profile_id) DO NOTHING
  `;
  return { saved: true };
}

export function serializeConversation(conversation) {
  return {
    id: conversation.id,
    slug: conversation.slug,
    title: conversation.title,
    description: conversation.description,
    kind: conversation.kind,
    updatedAt: conversation.updated_at,
    isPinned: conversation.is_pinned,
    isMuted: conversation.is_muted,
    isArchived: conversation.is_archived,
    unreadCount: conversation.unread_count ?? 0,
    savedCount: conversation.saved_count ?? 0,
    latestMessage: conversation.latest_message_id
      ? {
          id: conversation.latest_message_id,
          content: conversation.latest_message_content,
          createdAt: conversation.latest_message_created_at,
          senderName: conversation.latest_message_sender_name,
        }
      : null,
  };
}

export function serializeMessage(message, activeProfileId) {
  const mine = message.sender_id === activeProfileId;

  return {
    id: message.id,
    conversationId: message.conversation_id,
    senderId: message.sender_id,
    senderName: message.sender_name,
    senderColor: message.sender_color,
    content: message.content,
    createdAt: message.created_at,
    editedAt: message.edited_at,
    status: mine ? (message.read_count > 0 ? 'seen' : 'sent') : 'received',
    isMine: mine,
    isSaved: message.is_saved,
    reactions: normalizeReactions(message.reactions),
    replyTo: message.parent_message_id
      ? {
          id: message.parent_message_id,
          senderId: message.parent_sender_id,
          senderName: message.parent_sender_name,
          content: message.parent_content,
        }
      : null,
  };
}

export function serializeParticipant(participant) {
  return {
    id: participant.id,
    displayName: participant.display_name,
    avatarColor: participant.avatar_color,
    role: participant.role,
    joinedAt: participant.joined_at,
    lastSeenAt: participant.last_seen_at,
  };
}
