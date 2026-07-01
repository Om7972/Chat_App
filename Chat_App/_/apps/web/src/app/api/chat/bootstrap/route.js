import {
  ensureDefaultConversations,
  ensureMembership,
  ensureProfile,
  getConversationList,
  getConversationMessages,
  getConversationParticipants,
  getTypingState,
  markConversationRead,
  normalizeProfile,
  serializeConversation,
  serializeMessage,
  serializeParticipant,
  touchPresence,
} from '@/app/api/utils/chat';

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const profile = normalizeProfile({
      profileId: url.searchParams.get('profileId'),
      displayName: url.searchParams.get('displayName'),
      avatarColor: url.searchParams.get('avatarColor'),
    });

    await ensureProfile(profile);
    await ensureDefaultConversations(profile.id);
    await touchPresence(profile.id);

    const conversations = await getConversationList(profile.id);
    const serializedConversations = conversations.map(serializeConversation);
    const requestedConversationId = url.searchParams.get('conversationId');
    const activeConversationId =
      requestedConversationId && serializedConversations.some((item) => item.id === requestedConversationId)
        ? requestedConversationId
        : serializedConversations[0]?.id;

    if (!activeConversationId) {
      return Response.json({
        profile,
        conversations: [],
        activeConversationId: null,
        messages: [],
        participants: [],
        typing: [],
      });
    }

    await ensureMembership(activeConversationId, profile.id);
    await markConversationRead(activeConversationId, profile.id);

    const [messages, participants, typing] = await Promise.all([
      getConversationMessages(activeConversationId, profile.id),
      getConversationParticipants(activeConversationId),
      getTypingState(activeConversationId, profile.id),
    ]);

    return Response.json({
      profile,
      conversations: serializedConversations.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              unreadCount: 0,
            }
          : conversation
      ),
      activeConversationId,
      messages: messages.map((message) => serializeMessage(message, profile.id)),
      participants: participants.map(serializeParticipant),
      typing: typing.map((entry) => ({
        profileId: entry.profile_id,
        displayName: entry.display_name,
        avatarColor: entry.avatar_color,
      })),
      refreshedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error bootstrapping chat:', error);
    return Response.json({ error: error?.message || 'Failed to bootstrap chat' }, { status: 500 });
  }
}
