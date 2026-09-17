import { isReplayOnly } from '@/lib/mode.mjs';

async function proxy(request: Request, context: { params: Promise<{ action: string }> }) {
  if (isReplayOnly()) return Response.json({ error: 'Live harness disabled in replay-only mode.' }, { status: 403 });
  const { action } = await context.params;
  if (!['state', 'runs', 'start', 'pause', 'resume', 'load', 'select'].includes(action)) return Response.json({ error: 'Not found.' }, { status: 404 });
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (!origin || new URL(origin).host !== request.headers.get('host')) return Response.json({ error: 'Same-origin request required.' }, { status: 403 });
    if (request.headers.get('content-type') !== 'application/json') return Response.json({ error: 'JSON required.' }, { status: 415 });
  }
  try {
    const body = request.method === 'POST' ? await request.text() : undefined;
    if (body && body.length > 1024) return Response.json({ error: 'Request too large.' }, { status: 413 });
    const response = await fetch(`http://127.0.0.1:8787/${action}`, { method: request.method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body, signal: AbortSignal.timeout(5000), cache: 'no-store' });
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ error: 'Harness offline. Start the app with npm run dev.' }, { status: 503 }); }
}
export const GET = proxy;
export const POST = proxy;
