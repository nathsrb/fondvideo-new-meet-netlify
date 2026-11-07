import type { Config } from '@netlify/functions';

// Called by the browser with short 16 kHz mono WAV segments; only audio leaves the device.
export default async function handler(request: Request): Promise<Response> {
  const json = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  const key = process.env.DEEPINFRA_API_KEY;
  if (!key) return json({ error: 'Transcription cloud non configurée : clé DEEPINFRA_API_KEY absente dans le contexte de prévisualisation Netlify.' }, 503);
  try {
    const form = await request.formData();
    const audio = form.get('audio');
    if (!(audio instanceof File) || audio.size === 0 || audio.size > 4_000_000) return json({ error: 'Extrait audio invalide ou trop volumineux.' }, 400);
    const upstreamForm = new FormData();
    upstreamForm.append('audio', audio, 'extrait.wav');
    upstreamForm.append('task', 'transcribe');
    const language = form.get('language');
    if (typeof language === 'string' && /^(fr|en|es)$/.test(language)) upstreamForm.append('language', language);
    const prompt = form.get('prompt');
    if (typeof prompt === 'string' && prompt.trim()) upstreamForm.append('initial_prompt', prompt.slice(0, 1000));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    let response: Response;
    try {
      response = await fetch('https://api.deepinfra.com/v1/inference/openai/whisper-large-v3', {
        method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: upstreamForm, signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }
    if (!response.ok) return json({ error: `Service de transcription indisponible (${response.status})` }, 502);
    const result = await response.json() as { words?: unknown[]; segments?: unknown[]; text?: string };
    return json({ words: result.words || [], segments: result.segments || [], text: result.text || '' });
  } catch (error) {
    return json({ error: error instanceof Error && error.name === 'AbortError' ? 'Délai dépassé lors de la transcription.' : 'Impossible de traiter cet extrait audio.' }, 502);
  }
}
export const config: Config = { path: '/.netlify/functions/transcribe' };
