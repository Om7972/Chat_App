'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  Check,
  CheckCheck,
  Menu,
  MessageCircleMore,
  PencilLine,
  Plus,
  Search,
  Send,
  Settings2,
  Sparkles,
  Users,
  X,
} from 'lucide-react';

const PROFILE_KEY = 'createxyz.chat.profile';
const DRAFTS_KEY = 'createxyz.chat.drafts';
const colors = ['#0f766e', '#1d4ed8', '#7c3aed', '#db2777', '#ea580c', '#0284c7'];
const nameLeft = ['Blue', 'Signal', 'Launch', 'North', 'Quiet', 'Delta', 'Atlas', 'Pixel'];
const nameRight = ['Orbit', 'Studio', 'Pulse', 'Harbor', 'Line', 'Foundry', 'Desk', 'Trail'];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function createLocalProfile() {
  return {
    profileId: globalThis.crypto?.randomUUID?.() || `profile-${Date.now()}`,
    displayName: `${randomItem(nameLeft)} ${randomItem(nameRight)}`,
    avatarColor: randomItem(colors),
  };
}

function getStoredProfile() {
  if (typeof window === 'undefined') return createLocalProfile();

  const raw = window.localStorage.getItem(PROFILE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch {}
  }

  const profile = createLocalProfile();
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  return profile;
}

function getStoredDrafts() {
  if (typeof window === 'undefined') return {};
  const raw = window.localStorage.getItem(DRAFTS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Request failed with status ${response.status}`);
  }
  return data;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(value) {
  return new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function isRecentlyActive(value) {
  if (!value) return false;
  return Date.now() - new Date(value).getTime() < 90_000;
}

function getStatusLabel(participant) {
  return isRecentlyActive(participant?.lastSeenAt) ? 'online' : 'away';
}

function useChatProfile() {
  const [profile, setProfile] = useState(() => getStoredProfile());

  useEffect(() => {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  return [profile, setProfile];
}

function EmptyState({ title, body, icon: Icon }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-slate-500">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-white">
        <Icon className="h-8 w-8" />
      </div>
      <div>
        <p className="text-lg font-semibold text-slate-900">{title}</p>
        <p className="mt-1 max-w-sm text-sm leading-6">{body}</p>
      </div>
    </div>
  );
}

function PresenceDot({ active }) {
  return (
    <span
      className={`inline-flex h-2.5 w-2.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`}
    />
  );
}

export default function ProductionChatApp() {
  const queryClient = useQueryClient();
  const [profile, setProfile] = useChatProfile();
  const [selectedConversationId, setSelectedConversationId] = useState(null);
  const [composer, setComposer] = useState('');
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState(() => getStoredDrafts());
  const [showNewChat, setShowNewChat] = useState(false);
  const [newRoomTitle, setNewRoomTitle] = useState('');
  const [newRoomDescription, setNewRoomDescription] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messageEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const bootstrapQuery = useQuery({
    queryKey: ['chat-bootstrap', profile.profileId, profile.displayName, profile.avatarColor, selectedConversationId],
    queryFn: () => {
      const params = new URLSearchParams({
        profileId: profile.profileId,
        displayName: profile.displayName,
        avatarColor: profile.avatarColor,
      });
      if (selectedConversationId) params.set('conversationId', selectedConversationId);
      return api(`/api/chat/bootstrap?${params.toString()}`);
    },
    refetchInterval: 5000,
  });

  const conversations = bootstrapQuery.data?.conversations ?? [];
  const activeConversationId = bootstrapQuery.data?.activeConversationId ?? selectedConversationId;
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ?? conversations[0] ?? null;
  const messages = bootstrapQuery.data?.messages ?? [];
  const participants = bootstrapQuery.data?.participants ?? [];
  const typing = bootstrapQuery.data?.typing ?? [];

  useEffect(() => {
    if (!selectedConversationId && bootstrapQuery.data?.activeConversationId) {
      setSelectedConversationId(bootstrapQuery.data.activeConversationId);
    }
  }, [bootstrapQuery.data?.activeConversationId, selectedConversationId]);

  useEffect(() => {
    if (!activeConversationId) return;
    const nextDraft = drafts[activeConversationId] ?? '';
    setComposer(nextDraft);
  }, [activeConversationId, drafts]);

  useEffect(() => {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  }, [drafts]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConversationId]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('conversation-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      window.clearTimeout(typingTimeoutRef.current);
    };
  }, []);

  const heartbeatMutation = useMutation({
    mutationFn: () =>
      api('/api/chat/presence', {
        method: 'POST',
        body: JSON.stringify(profile),
      }),
  });

  useEffect(() => {
    heartbeatMutation.mutate();
    const intervalId = window.setInterval(() => heartbeatMutation.mutate(), 25_000);
    return () => window.clearInterval(intervalId);
  }, [profile.profileId, profile.displayName, profile.avatarColor]);

  const readMutation = useMutation({
    mutationFn: (conversationId) =>
      api('/api/chat/read', {
        method: 'POST',
        body: JSON.stringify({
          ...profile,
          conversationId,
        }),
      }),
  });

  useEffect(() => {
    if (!activeConversationId) return;
    readMutation.mutate(activeConversationId);
  }, [activeConversationId]);

  const typingMutation = useMutation({
    mutationFn: ({ conversationId, isTyping }) =>
      api('/api/chat/typing', {
        method: 'POST',
        body: JSON.stringify({
          ...profile,
          conversationId,
          isTyping,
        }),
      }),
  });

  const sendMutation = useMutation({
    mutationFn: (content) =>
      api('/api/chat/messages', {
        method: 'POST',
        body: JSON.stringify({
          ...profile,
          conversationId: activeConversationId,
          content,
        }),
      }),
    onSuccess: () => {
      if (activeConversationId) {
        typingMutation.mutate({ conversationId: activeConversationId, isTyping: false });
      }
      if (activeConversationId) {
        setDrafts((current) => ({ ...current, [activeConversationId]: '' }));
      }
      setComposer('');
      queryClient.invalidateQueries({ queryKey: ['chat-bootstrap'] });
    },
  });

  const createConversationMutation = useMutation({
    mutationFn: () =>
      api('/api/chat/conversations', {
        method: 'POST',
        body: JSON.stringify({
          ...profile,
          title: newRoomTitle,
          description: newRoomDescription,
        }),
      }),
    onSuccess: (result) => {
      setShowNewChat(false);
      setNewRoomTitle('');
      setNewRoomDescription('');
      setSelectedConversationId(result.conversation.id);
      queryClient.invalidateQueries({ queryKey: ['chat-bootstrap'] });
    },
  });

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;

    return conversations.filter((conversation) => {
      const haystacks = [
        conversation.title,
        conversation.description,
        conversation.latestMessage?.content,
        conversation.latestMessage?.senderName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystacks.includes(term);
    });
  }, [conversations, search]);

  const insights = useMemo(() => {
    const unreadTotal = conversations.reduce((sum, conversation) => sum + (conversation.unreadCount || 0), 0);
    const onlineCount = participants.filter((participant) => isRecentlyActive(participant.lastSeenAt)).length;

    return [
      { label: 'Unread', value: String(unreadTotal) },
      { label: 'Members', value: String(participants.length) },
      { label: 'Online', value: String(onlineCount) },
    ];
  }, [conversations, participants]);

  const handleComposerChange = (value) => {
    setComposer(value);
    if (activeConversationId) {
      setDrafts((current) => ({ ...current, [activeConversationId]: value }));
      typingMutation.mutate({ conversationId: activeConversationId, isTyping: value.trim().length > 0 });
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
        typingMutation.mutate({ conversationId: activeConversationId, isTyping: false });
      }, 2500);
    }
  };

  const handleSend = (event) => {
    event.preventDefault();
    const content = composer.trim();
    if (!content || !activeConversationId || sendMutation.isPending) return;
    sendMutation.mutate(content);
  };

  const renameProfile = () => {
    const next = window.prompt('Update your display name', profile.displayName);
    if (!next) return;
    setProfile((current) => ({ ...current, displayName: next.trim().slice(0, 48) || current.displayName }));
    queryClient.invalidateQueries({ queryKey: ['chat-bootstrap'] });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col">
        <header className="border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 lg:hidden"
                onClick={() => setSidebarOpen((current) => !current)}
              >
                {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
              </button>
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">
                <MessageCircleMore className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold">CreateXYZ Messenger</h1>
                <p className="text-sm text-slate-500">
                  Production chat workspace with rooms, delivery state, search, and presence.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={renameProfile}
                className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 md:inline-flex"
              >
                <span
                  className="inline-flex h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: profile.avatarColor }}
                />
                {profile.displayName}
              </button>
              <button
                type="button"
                onClick={() => setShowNewChat((current) => !current)}
                className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              >
                <Plus className="h-4 w-4" />
                New room
              </button>
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
          <aside
            className={`border-r border-slate-200 bg-white ${sidebarOpen ? 'block' : 'hidden'} lg:block`}
          >
            <div className="border-b border-slate-200 p-4">
              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  id="conversation-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search rooms or messages"
                  className="w-full bg-transparent text-sm placeholder:text-slate-400"
                />
              </label>
              <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                {insights.map((item) => (
                  <div key={item.label} className="rounded-2xl bg-slate-900 px-3 py-3 text-white">
                    <p className="text-lg font-semibold">{item.value}</p>
                    <p className="text-xs text-slate-300">{item.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {showNewChat && (
              <div className="border-b border-slate-200 p-4">
                <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Start a new room</p>
                    <button type="button" onClick={() => setShowNewChat(false)} className="text-slate-400">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <input
                    value={newRoomTitle}
                    onChange={(event) => setNewRoomTitle(event.target.value)}
                    placeholder="Room name"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <textarea
                    value={newRoomDescription}
                    onChange={(event) => setNewRoomDescription(event.target.value)}
                    placeholder="What is this room for?"
                    className="h-24 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => createConversationMutation.mutate()}
                    disabled={createConversationMutation.isPending || !newRoomTitle.trim()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    {createConversationMutation.isPending ? 'Creating...' : 'Create room'}
                  </button>
                </div>
              </div>
            )}

            <div className="max-h-[calc(100vh-235px)] overflow-y-auto">
              {filteredConversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;

                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => {
                      setSelectedConversationId(conversation.id);
                      setSidebarOpen(false);
                    }}
                    className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-4 text-left transition ${
                      isActive ? 'bg-slate-900 text-white' : 'bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-slate-200 text-sm font-semibold text-slate-700">
                      {conversation.title.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-semibold">{conversation.title}</p>
                        <span className={`text-xs ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                          {conversation.latestMessage?.createdAt
                            ? formatDateLabel(conversation.latestMessage.createdAt)
                            : ''}
                        </span>
                      </div>
                      <p className={`mt-1 truncate text-sm ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                        {conversation.latestMessage
                          ? `${conversation.latestMessage.senderName}: ${conversation.latestMessage.content}`
                          : conversation.description}
                      </p>
                    </div>
                    {conversation.unreadCount > 0 ? (
                      <span className="inline-flex min-h-6 min-w-6 items-center justify-center rounded-full bg-emerald-500 px-2 text-xs font-semibold text-white">
                        {conversation.unreadCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="flex min-h-0 flex-col bg-slate-50">
            {activeConversation ? (
              <>
                <div className="border-b border-slate-200 bg-white px-4 py-4 md:px-6">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="truncate text-lg font-semibold">{activeConversation.title}</h2>
                        <PresenceDot active={typing.length > 0 || participants.some((item) => isRecentlyActive(item.lastSeenAt))} />
                      </div>
                      <p className="truncate text-sm text-slate-500">{activeConversation.description}</p>
                    </div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <Bell className="h-4 w-4" />
                      <Users className="h-4 w-4" />
                      <span className="text-sm">{participants.length} members</span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-6 md:px-6">
                  <div className="mx-auto flex max-w-3xl flex-col gap-4">
                    {messages.map((message, index) => {
                      const showDayDivider =
                        index === 0 ||
                        formatDateLabel(messages[index - 1].createdAt) !== formatDateLabel(message.createdAt);

                      return (
                        <div key={message.id}>
                          {showDayDivider ? (
                            <div className="mb-4 flex justify-center">
                              <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-400 shadow-sm">
                                {formatDateLabel(message.createdAt)}
                              </span>
                            </div>
                          ) : null}
                          <div className={`flex ${message.isMine ? 'justify-end' : 'justify-start'}`}>
                            <div
                              className={`max-w-[85%] rounded-3xl px-4 py-3 shadow-sm md:max-w-[70%] ${
                                message.isMine
                                  ? 'rounded-br-md bg-slate-900 text-white'
                                  : 'rounded-bl-md bg-white text-slate-900'
                              }`}
                            >
                              {!message.isMine ? (
                                <div className="mb-1 flex items-center gap-2">
                                  <span
                                    className="inline-flex h-2.5 w-2.5 rounded-full"
                                    style={{ backgroundColor: message.senderColor }}
                                  />
                                  <span className="text-xs font-semibold text-slate-500">{message.senderName}</span>
                                </div>
                              ) : null}
                              <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                              <div
                                className={`mt-2 flex items-center justify-end gap-2 text-xs ${
                                  message.isMine ? 'text-slate-300' : 'text-slate-400'
                                }`}
                              >
                                <span>{formatTime(message.createdAt)}</span>
                                {message.isMine ? (
                                  message.status === 'seen' ? (
                                    <CheckCheck className="h-3.5 w-3.5" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {typing.length > 0 ? (
                      <div className="flex justify-start">
                        <div className="rounded-3xl rounded-bl-md bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                          {typing.map((entry) => entry.displayName).join(', ')} typing...
                        </div>
                      </div>
                    ) : null}
                    <div ref={messageEndRef} />
                  </div>
                </div>

                <div className="border-t border-slate-200 bg-white px-4 py-4 md:px-6">
                  <form onSubmit={handleSend} className="mx-auto flex max-w-3xl items-end gap-3">
                    <div className="flex-1 rounded-3xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <textarea
                        value={composer}
                        onChange={(event) => handleComposerChange(event.target.value)}
                        placeholder={`Message ${activeConversation.title}`}
                        className="h-24 w-full resize-none bg-transparent text-sm leading-6 placeholder:text-slate-400"
                      />
                      <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                        <span>Drafts persist per room</span>
                        <span>{composer.trim().length}/2000</span>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={!composer.trim() || sendMutation.isPending}
                      className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white disabled:opacity-50"
                    >
                      <Send className="h-5 w-5" />
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <EmptyState
                title="No conversation selected"
                body="Create a room or pick one from the sidebar to begin."
                icon={MessageCircleMore}
              />
            )}
          </main>

          <aside className="hidden border-l border-slate-200 bg-white lg:block">
            <div className="border-b border-slate-200 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Room controls</p>
                  <p className="mt-1 text-sm text-slate-500">Presence, participants, and launch-ready behaviors.</p>
                </div>
                <Settings2 className="h-4 w-4 text-slate-400" />
              </div>
            </div>

            <div className="space-y-6 p-5">
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Implemented now</p>
                <div className="mt-3 space-y-2">
                  {[
                    'Multi-room messaging with unread counts',
                    'Presence heartbeat and typing state',
                    'Read receipts and delivery state',
                    'Persistent identity and per-room drafts',
                    'Searchable sidebar and deploy healthcheck',
                  ].map((item) => (
                    <div key={item} className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      {item}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Participants</p>
                <div className="mt-3 space-y-3">
                  {participants.map((participant) => (
                    <div key={participant.id} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span
                          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold text-white"
                          style={{ backgroundColor: participant.avatarColor }}
                        >
                          {participant.displayName.slice(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-slate-800">{participant.displayName}</p>
                          <p className="text-xs text-slate-500">
                            {participant.role} - {getStatusLabel(participant)}
                          </p>
                        </div>
                      </div>
                      <PresenceDot active={isRecentlyActive(participant.lastSeenAt)} />
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Scalability next</p>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className="rounded-2xl border border-slate-200 px-4 py-3">
                    Use WebSockets or SSE for push delivery instead of polling.
                  </div>
                  <div className="rounded-2xl border border-slate-200 px-4 py-3">
                    Add Redis for presence fan-out, rate limits, and queue-backed notifications.
                  </div>
                  <div className="rounded-2xl border border-slate-200 px-4 py-3">
                    Move media to object storage plus a CDN, and keep Postgres focused on metadata.
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>

      {bootstrapQuery.isLoading ? (
        <div className="fixed inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-slate-900 px-4 py-2 text-sm text-white shadow-lg">
          Syncing conversations...
        </div>
      ) : null}

      {bootstrapQuery.isError ? (
        <div className="fixed inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-rose-600 px-4 py-2 text-sm text-white shadow-lg">
          {bootstrapQuery.error.message}
        </div>
      ) : null}

      {createConversationMutation.isError ? (
        <div className="fixed right-4 top-4 rounded-2xl bg-rose-600 px-4 py-3 text-sm text-white shadow-lg">
          {createConversationMutation.error.message}
        </div>
      ) : null}

      <button
        type="button"
        onClick={renameProfile}
        className="fixed bottom-4 left-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-lg md:hidden"
      >
        <PencilLine className="h-4 w-4" />
        {profile.displayName}
      </button>
    </div>
  );
}
