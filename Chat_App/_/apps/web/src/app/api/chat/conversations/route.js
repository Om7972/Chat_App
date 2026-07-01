import {
  createConversation,
  ensureProfile,
  normalizeProfile,
} from '@/app/api/utils/chat';

export async function POST(request) {
  try {
    const payload = await request.json();
    const profile = normalizeProfile(payload);
    const title = String(payload?.title || '').trim();
    const description = String(payload?.description || '').trim();

    if (!title) {
      return Response.json({ error: 'title is required' }, { status: 400 });
    }

    if (title.length > 60) {
      return Response.json({ error: 'title exceeds 60 characters' }, { status: 400 });
    }

    await ensureProfile(profile);
    const conversation = await createConversation({ profileId: profile.id, title, description });

    return Response.json({ conversation });
  } catch (error) {
    console.error('Error creating conversation:', error);
    return Response.json({ error: error?.message || 'Failed to create conversation' }, { status: 500 });
  }
}
