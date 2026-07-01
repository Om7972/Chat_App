import {
  ensureMembership,
  ensureProfile,
  markConversationRead,
  normalizeProfile,
} from '@/app/api/utils/chat';

export async function POST(request) {
  try {
    const payload = await request.json();
    const profile = normalizeProfile(payload);
    const conversationId = String(payload?.conversationId || '').trim();

    if (!conversationId) {
      return Response.json({ error: 'conversationId is required' }, { status: 400 });
    }

    await ensureProfile(profile);
    await ensureMembership(conversationId, profile.id);
    await markConversationRead(conversationId, profile.id);

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Error marking conversation read:', error);
    return Response.json({ error: error?.message || 'Failed to mark conversation read' }, { status: 500 });
  }
}
