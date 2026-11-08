import type { Config } from '@netlify/functions';

const MAX_AUDIO_BYTES = 4_000_000;
const MODEL = 'whisper-large-v3';

export default async function handler(request: Request): Promise<Response> {
  const json = (body: object, status = 200) =>
    Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);

  const key = process.env.GROQ_API_KEY;
  if (!key) return json({ error: 'Transcription cloud non configurée : clé GROQ_API_KEY absente dans le contexte de prévisualisation Netlify.' }, 503);

  try {
    const form = await request.formData();
    const audio = form.get('audio');
    if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) return json({ error: 'Extrait audio invalide ou trop volumineux.' }, 400);

    const upstreamForm = new FormData();
    upstreamForm.append('file', audio, 'extrait.wav');
    upstreamForm.append('model', MODEL);
    upstreamForm.append('response_format', 'verbose_json');
    upstreamForm.append('timestamp_granularities[]', 'word');

    const language = form.get('language');
    if (typeof language === 'string' && /^[a-z]{2}$/i.test(language)) upstreamForm.append('language', language.toLowerCase());
    const prompt = form.get('prompt');
    if (typeof prompt === 'string' && prompt.trim()) upstreamForm.append('prompt', prompt.slice(0, 1000));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: upstreamForm, signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }

    if (!response.ok) {
      if (response.status === 401) return json({ error: 'Clé Groq invalide ou refusée.' }, 502);
      if (response.status === 429) return json({ error: 'Quota Groq temporairement atteint. Réessaie dans quelques instants.' }, 429);
      return json({ error: `Service Groq indisponible (${response.status}).` }, 502);
    }

    const result = await response.json() as {
      words?: Array<{ word?: string; text?: string; start?: number; end?: number }>;
      segments?: Array<{ text?: string; start?: number; end?: number }>; text?: string;
    };
    const words = Array.isArray(result.words) ? result.words.map(word => ({
      text: String(word.word ?? word.text ?? '').trim(), start: Number(word.start), end: Number(word.end),
    })).filter(word => word.text && Number.isFinite(word.start) && Number.isFinite(word.end) && word.end > word.start) : [];
    return json({ model: MODEL, words, segments: result.segments || [], text: result.text || '' });
  } catch (error) {
    return json({ error: error instanceof Error && error.name === 'AbortError' ? 'Délai dépassé lors de la transcription Groq.' : 'Impossible de traiter cet extrait audio.' }, 502);
  }
}
export const config: Config = { path: '/.netlify/functions/transcribe' };
