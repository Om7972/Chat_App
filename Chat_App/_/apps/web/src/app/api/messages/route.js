import {
  ensureDefaultConversations,
  ensureProfile,
  getConversationList,
  getConversationMessages,
  normalizeProfile,
  sendMessage,
} from '@/app/api/utils/chat';

async function getLaunchpadConversation(profileId) {
  await ensureDefaultConversations(profileId);
  const conversations = await getConversationList(profileId);
  return conversations.find((conversation) => conversation.slug === 'launchpad') ?? conversations[0];
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const profile = normalizeProfile({
      profileId: url.searchParams.get('profileId') || 'legacy-viewer',
      displayName: url.searchParams.get('displayName') || 'Legacy Viewer',
      avatarColor: url.searchParams.get('avatarColor') || '#4f46e5',
    });

    await ensureProfile(profile);
    const conversation = await getLaunchpadConversation(profile.id);
    const messages = await getConversationMessages(conversation.id, profile.id);

    return Response.json({
      messages: messages.map((message) => ({
        id: message.id,
        content: message.content,
        anonymous_name: message.sender_name,
        created_at: message.created_at,
      })),
    });
  } catch (error) {
    console.error('Error fetching legacy messages:', error);
    return Response.json({ error: error?.message || 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const payload = await request.json();
    const profile = normalizeProfile({
      profileId: payload?.profileId || `legacy-${String(payload?.anonymousName || 'guest').toLowerCase().replace(/\s+/g, '-')}`,
      displayName: payload?.anonymousName,
      avatarColor: payload?.avatarColor || '#4f46e5',
    });
    const content = String(payload?.content || '').trim();

    if (!content) {
      return Response.json({ error: 'Message content is required' }, { status: 400 });
    }

    await ensureProfile(profile);
    const conversation = await getLaunchpadConversation(profile.id);
    const message = await sendMessage({
      conversationId: conversation.id,
      profileId: profile.id,
      content,
    });

    return Response.json({
      message: {
        id: message.id,
        content: message.content,
        anonymous_name: profile.displayName,
        created_at: message.created_at,
      },
    });
  } catch (error) {
    console.error('Error creating legacy message:', error);
    return Response.json({ error: error?.message || 'Failed to create message' }, { status: 500 });
  }
}
