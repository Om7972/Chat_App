import { ensureProfile, normalizeProfile, touchPresence } from '@/app/api/utils/chat';

export async function POST(request) {
  try {
    const payload = await request.json();
    const profile = normalizeProfile(payload);
    await ensureProfile(profile);
    await touchPresence(profile.id);
    return Response.json({ ok: true, lastSeenAt: new Date().toISOString() });
  } catch (error) {
    console.error('Error updating presence:', error);
    return Response.json({ error: error?.message || 'Failed to update presence' }, { status: 500 });
  }
}
