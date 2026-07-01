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
    welcome:
      'Engineering is ready for API reviews, bug triage, and production work.',
  },
  {
    slug: 'design-ops',
    title: 'Design Ops',
    description: 'Design reviews, UX feedback, and polish tracking.',
    welcome:
      'Design Ops is for UX feedback, accessibility notes, and finish-line polish.',
  },
];

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

export async function ensureDefaultConversations(profileId) {
  await sql`
    INSERT INTO chat_profiles (id, display_name, avatar_color, updated_at, last_seen_at)
    VALUES ('system-bot', 'CreateXYZ Bot', '#0f766e', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET
      updated_at = NOW(),
      last_seen_at = NOW()
  `;

  for (const conversation of DEFAULT_CONVERSATIONS) {
    await sql`
      INSERT INTO conversations (slug, title, description, kind, created_by, updated_at)
      VALUES (
        ${conversation.slug},
        ${conversation.title},
        ${conversation.description},
        'group',
        'system-bot',
        NOW()
      )
      ON CONFLICT (slug) DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description
    `;

    const [storedConversation] = await sql`
      SELECT id
      FROM conversations
      WHERE slug = ${conversation.slug}
      LIMIT 1
    `;

    await sql`
      INSERT INTO conversation_members (conversation_id, profile_id, role)
      VALUES (${storedConversation.id}, 'system-bot', 'owner')
      ON CONFLICT (conversation_id, profile_id) DO NOTHING
    `;

    await sql`
      INSERT INTO conversation_members (conversation_id, profile_id, role)
      VALUES (${storedConversation.id}, ${profileId}, 'member')
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
    ORDER BY cm.is_pinned DESC, COALESCE(latest.created_at, c.updated_at) DESC, c.title ASC
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
      )::int AS read_count
    FROM chat_messages m
    INNER JOIN chat_profiles p ON p.id = m.sender_id
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

export async function sendMessage({ conversationId, profileId, content }) {
  const [message] = await sql`
    INSERT INTO chat_messages (conversation_id, sender_id, content)
    VALUES (${conversationId}, ${profileId}, ${content})
    RETURNING id, conversation_id, sender_id, content, status, created_at, edited_at
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

export function serializeConversation(conversation) {
  return {
    id: conversation.id,
    slug: conversation.slug,
    title: conversation.title,
    description: conversation.description,
    kind: conversation.kind,
    updatedAt: conversation.updated_at,
    isPinned: conversation.is_pinned,
    unreadCount: conversation.unread_count ?? 0,
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
