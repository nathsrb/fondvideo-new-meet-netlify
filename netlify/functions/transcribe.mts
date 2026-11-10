/**
 * SCELYO Studio - Groq Whisper Large V3 transcription proxy.
 * Runs in Netlify deploy previews; the Groq secret never reaches the browser.
 */
import { getDeployStore } from '@netlify/blobs';
import type { Config } from '@netlify/functions';

const LIMIT_BYTES = 2_300_000; // 25 seconds @ 16kHz/16-bit mono is ~800kB.
const requestsPerHour = 55;
const rateStore = () => getDeployStore({ name: 'scelyo-preview-transcription-limits', consistency: 'strong' });

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
async function rateLimit(request: Request) {
  const ip = request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown';
  const bytes = new TextEncoder().encode(ip);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const fingerprint = Array.from(new Uint8Array(digest)).slice(0, 12).map(x => x.toString(16).padStart(2, '0')).join('');
  const hour = Math.floor(Date.now() / 3600000);
  const key = fingerprint + '/' + hour;
  const store = rateStore();
  const record = await store.get(key, { type: 'json' }) as { count: number } | null;
  if ((record?.count || 0) >= requestsPerHour) return false;
  await store.setJSON(key, { count: (record?.count || 0) + 1 });
  return true;
}

export default async function handler(request: Request) {
  // Diagnostic endpoint avoids posting real audio to check configuration.
  if (request.method === 'GET') {
    return json({available:Boolean(globalThis.Netlify?.env.get('GROQ_API_KEY')),model:'whisper-large-v3'});
  }
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    return json({ error: 'Origine non autorisée.' }, 403);
  }
  const key = globalThis.Netlify?.env.get('GROQ_API_KEY') || '';
  if (!key) return json({ error: 'Whisper Large V3 n’est pas configuré pour cette prévisualisation.' }, 503);
  const length = Number(request.headers.get('content-length') || 0);
  if (length > LIMIT_BYTES) return json({ error: 'Extrait audio trop volumineux.' }, 413);
  const language = request.headers.get('x-scelyo-language') || 'auto';
  if (!['auto', 'fr', 'en', 'es'].includes(language)) return json({ error: 'Langue non prise en charge.' }, 400);
  try {
    if (!(await rateLimit(request))) return json({ error: 'Limite de transcription atteinte. Réessaie plus tard.' }, 429);
    const wav = await request.arrayBuffer();
    if (wav.byteLength < 100 || wav.byteLength > LIMIT_BYTES)
      return json({ error: 'Extrait audio vide ou trop volumineux.' }, 413);
    const form = new FormData();
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'scelyo-clip.wav');
    form.append('model', 'whisper-large-v3');
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('temperature', '0');
    if (language !== 'auto') form.append('language', language);
    const upstream = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    if (!upstream.ok) {
      return json({
        error: upstream.status === 429
          ? 'Limite Groq atteinte, utilise le modèle local ou réessaie plus tard.'
          : 'Transcription Groq indisponible (' + upstream.status + ').',
      }, upstream.status === 429 ? 429 : 502);
    }
    const result = await upstream.json() as {
      text?: string;
      words?: Array<{ word: string; start: number; end: number }>;
      segments?: Array<{ text: string; start: number; end: number }>;
    };
    return json({
      model: 'whisper-large-v3',
      text: result.text || '',
      words: Array.isArray(result.words) ? result.words : [],
      segments: Array.isArray(result.segments) ? result.segments : [],
    });
  } catch {
    return json({ error: 'Transcription momentanément indisponible.' }, 503);
  }
}
export const config: Config = { path: '/scelyo-transcribe' };
