/**
 * Netlify preview transport for FondVidéo New Meet.
 * Replaces the proprietary AppDeploy API / WebSocket bridge.
 * Uses low-frequency polling for signalling. Not for high-scale production.
 */

type JsonRecord = Record<string, unknown>;
type ApiResult<T = any> = { data: T };
let activeToken: string | null = null;

async function request<T = any>(method: string, url: string, payload?: JsonRecord): Promise<ApiResult<T>> {
  const data = payload ? { ...payload } : undefined;
  const roomMutation = /\/api\/rooms\/[a-z2-9]{12}\/(?!join)[\w-]+$/.test(url);
  if (roomMutation && activeToken && data) data.session_token = activeToken;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: data ? { 'Content-Type': 'application/json' } : undefined,
      body: data ? JSON.stringify(data) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new Error('Connexion au serveur de réunion indisponible.');
  }
  let body: any = {};
  try { body = await response.json(); } catch { /* surface HTTP status */ }
  if (!response.ok) throw new Error(body.error || body.message || `Erreur serveur (${response.status})`);
  if (method === 'POST' && /\/api\/rooms\/[a-z2-9]{12}\/join$/.test(url)) {
    if (typeof body.sessionToken === 'string') activeToken = body.sessionToken;
  }
  if (method === 'POST' && /\/api\/rooms\/[a-z2-9]{12}\/leave$/.test(url)) activeToken = null;
  return { data: body as T };
}

export const api = {
  get<T = any>(url: string): Promise<ApiResult<T>> { return request<T>('GET', url); },
  post<T = any>(url: string, payload?: JsonRecord): Promise<ApiResult<T>> { return request<T>('POST', url, payload); },
};

type IncomingMessage = { v: number; type: string; payload: any };
class PollingConnection {
  readonly connectionId = crypto.randomUUID();
  readonly ready = Promise.resolve();
  private listener: (message: IncomingMessage) => void = () => {};
  private cursor = '';
  private stopped = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active = false;

  constructor() { this.timer = setTimeout(() => void this.poll(), 100); }
  onMessage(callback: (message: IncomingMessage) => void) { this.listener = callback; }
  private async poll() {
    if (this.stopped || this.active) return;
    this.active = true;
    try {
      const params = new URLSearchParams({ connection_id: this.connectionId, after: this.cursor });
      const { data } = await api.get<{ events: { id: string; message: IncomingMessage }[] }>(
        `/api/ws/events?${params.toString()}`
      );
      for (const event of data.events || []) {
        if (event.id > this.cursor) this.cursor = event.id;
        try { this.listener(event.message); } catch (error) { console.warn('Room event error', error); }
      }
    } catch (error) {
      console.warn('Meet event polling unavailable', error);
    } finally {
      this.active = false;
      if (!this.stopped) this.timer = setTimeout(() => void this.poll(), document.hidden ? 3500 : 1500);
    }
  }
  disconnect() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    activeToken = null;
  }
}
export const ws = { connect(): PollingConnection { return new PollingConnection(); } };
