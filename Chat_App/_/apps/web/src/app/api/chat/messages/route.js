import {
  ensureMembership,
  ensureProfile,
  normalizeProfile,
  sendMessage,
} from '@/app/api/utils/chat';

export async function POST(request) {
  try {
    const payload = await request.json();
    const profile = normalizeProfile(payload);
    const conversationId = String(payload?.conversationId || '').trim();
    const content = String(payload?.content || '').trim();
    const parentMessageId = payload?.parentMessageId ? String(payload.parentMessageId).trim() : null;

    if (!conversationId) {
      return Response.json({ error: 'conversationId is required' }, { status: 400 });
    }

    if (!content) {
      return Response.json({ error: 'content is required' }, { status: 400 });
    }

    if (content.length > 2000) {
      return Response.json({ error: 'content exceeds 2000 characters' }, { status: 400 });
    }

    await ensureProfile(profile);
    await ensureMembership(conversationId, profile.id);

    const message = await sendMessage({
      conversationId,
      profileId: profile.id,
      content,
      parentMessageId,
    });

    return Response.json({ message });
  } catch (error) {
    console.error('Error sending message:', error);
    return Response.json({ error: error?.message || 'Failed to send message' }, { status: 500 });
  }
}
