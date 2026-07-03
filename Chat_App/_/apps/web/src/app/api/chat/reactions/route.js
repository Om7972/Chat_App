import {
  ensureProfile,
  normalizeProfile,
  toggleReaction,
} from '@/app/api/utils/chat';
import sql from '@/app/api/utils/sql';

export async function POST(request) {
  try {
    const payload = await request.json();
    const profile = normalizeProfile(payload);
    const messageId = String(payload?.messageId || '').trim();
    const emoji = String(payload?.emoji || '').trim().slice(0, 16);

    if (!messageId) {
      return Response.json({ error: 'messageId is required' }, { status: 400 });
    }

    if (!emoji) {
      return Response.json({ error: 'emoji is required' }, { status: 400 });
    }

    await ensureProfile(profile);

    const memberships = await sql`
      SELECT m.id
      FROM chat_messages m
      INNER JOIN conversation_members cm
        ON cm.conversation_id = m.conversation_id
      WHERE m.id = ${messageId}
        AND cm.profile_id = ${profile.id}
      LIMIT 1
    `;

    if (memberships.length === 0) {
      return Response.json({ error: 'Message access not found' }, { status: 404 });
    }

    const result = await toggleReaction({ messageId, profileId: profile.id, emoji });
    return Response.json(result);
  } catch (error) {
    console.error('Error toggling reaction:', error);
    return Response.json({ error: error?.message || 'Failed to toggle reaction' }, { status: 500 });
  }
}
