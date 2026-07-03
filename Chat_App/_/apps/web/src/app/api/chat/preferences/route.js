import {
  ensureMembership,
  ensureProfile,
  normalizeProfile,
  setConversationPreferences,
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

    await setConversationPreferences({
      conversationId,
      profileId: profile.id,
      isPinned: typeof payload?.isPinned === 'boolean' ? payload.isPinned : null,
      isMuted: typeof payload?.isMuted === 'boolean' ? payload.isMuted : null,
      isArchived: typeof payload?.isArchived === 'boolean' ? payload.isArchived : null,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Error updating conversation preferences:', error);
    return Response.json({ error: error?.message || 'Failed to update conversation preferences' }, { status: 500 });
  }
}
