import sql from '@/app/api/utils/sql';
import {
  ensureMembership,
  ensureProfile,
  normalizeProfile,
} from '@/app/api/utils/chat';

export async function POST(request) {
  try {
    const payload = await request.json();
    const profile = normalizeProfile(payload);
    const conversationId = String(payload?.conversationId || '').trim();
    const isTyping = Boolean(payload?.isTyping);

    if (!conversationId) {
      return Response.json({ error: 'conversationId is required' }, { status: 400 });
    }

    await ensureProfile(profile);
    await ensureMembership(conversationId, profile.id);

    if (isTyping) {
      await sql`
        INSERT INTO typing_state (conversation_id, profile_id, expires_at)
        VALUES (${conversationId}, ${profile.id}, NOW() + interval '12 seconds')
        ON CONFLICT (conversation_id, profile_id) DO UPDATE SET
          expires_at = EXCLUDED.expires_at
      `;
    } else {
      await sql`
        DELETE FROM typing_state
        WHERE conversation_id = ${conversationId}
          AND profile_id = ${profile.id}
      `;
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Error updating typing state:', error);
    return Response.json({ error: error?.message || 'Failed to update typing state' }, { status: 500 });
  }
}
