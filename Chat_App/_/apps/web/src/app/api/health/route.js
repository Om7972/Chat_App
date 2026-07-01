import sql from '@/app/api/utils/sql';

export async function GET() {
  try {
    const [result] = await sql`SELECT NOW() AS now`;
    return Response.json({
      ok: true,
      service: 'createxyz-chat-web',
      database: 'reachable',
      now: result?.now ?? null,
    });
  } catch (error) {
    console.error('Healthcheck failed:', error);
    return Response.json(
      {
        ok: false,
        service: 'createxyz-chat-web',
        database: 'unreachable',
        error: error?.message || 'Healthcheck failed',
      },
      { status: 500 }
    );
  }
}
